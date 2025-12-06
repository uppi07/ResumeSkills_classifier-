import { NextResponse } from "next/server";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const PRIMARY_MODEL = "gpt-4.1";
const FALLBACK_MODEL = "gpt-4o-mini";
const REWRITE_MAX_TOKENS = 4000;

const SCORING_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "ats_and_interview_scores",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["ats_score", "ats_reason", "interview_score", "interview_reason"],
      properties: {
        ats_score: { type: "number", minimum: 0, maximum: 100 },
        ats_reason: { type: "string" },
        interview_score: { type: "number", minimum: 0, maximum: 100 },
        interview_reason: { type: "string" },
      },
    },
  },
} as const;

function extractWithMarkers(text: string) {
  const markerMatch = text.match(
    /__OUTPUT_START__([\s\S]*?)__OUTPUT_END__/i,
  );
  if (markerMatch) {
    return markerMatch[1];
  }
  return text;
}

function sanitizeOutput(text: string) {
  return text
    .split(/\r?\n/)
    .filter(
      (line) =>
        !line.includes("__OUTPUT_START__") &&
        !line.includes("__OUTPUT_END__"),
    )
    .join("\n");
}

function getRewriteWindow(template: string) {
  const beginDoc = template.indexOf("\\begin{document}");
  const endDoc = template.lastIndexOf("\\end{document}");
  if (beginDoc === -1 || endDoc === -1 || endDoc <= beginDoc) {
    return { prefixEnd: 0, suffixStart: template.length };
  }
  const objectiveIndex = template.indexOf("\\section*{Objective}");
  const techIndex = template.indexOf("\\section*{Technical Skills}");
  const educationIndex = template.indexOf("\\section*{Education}");
  const prefixEnd =
    objectiveIndex !== -1 && objectiveIndex > beginDoc
      ? objectiveIndex
      : techIndex !== -1 && techIndex > beginDoc
        ? techIndex
        : beginDoc + "\\begin{document}".length;
  const suffixStart =
    educationIndex !== -1 && educationIndex > prefixEnd ? educationIndex : endDoc;
  return { prefixEnd, suffixStart };
}

function mergeIntoTemplate(reply: string, template: string) {
  if (reply.includes("\\documentclass")) {
    return reply;
  }

  if (!template.includes("\\documentclass")) {
    return ["\\documentclass{article}", "\\begin{document}", reply, "\\end{document}"].join(
      "\n",
    );
  }

  const beginDoc = template.indexOf("\\begin{document}");
  const endDoc = template.lastIndexOf("\\end{document}");
  if (beginDoc === -1 || endDoc === -1 || endDoc <= beginDoc) {
    return reply;
  }

  const { prefixEnd, suffixStart } = getRewriteWindow(template);
  const prefix = template.slice(0, prefixEnd);
  const suffix = template.slice(suffixStart);

  return [prefix.trimEnd(), reply.trim(), suffix.trimStart()].join("\n\n");
}

function toTextContent(content: unknown) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof (part as any).text === "string") {
          return (part as any).text;
        }
        return "";
      })
      .join("");
  }
  if (typeof content === "object" && "text" in (content as any) && typeof (content as any).text === "string") {
    return (content as any).text;
  }
  return "";
}

function parseJsonContent(content: unknown) {
  if (!content) return null;
  if (typeof content === "string") {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === "object") {
        if ("json" in item) return item.json;
        if ("text" in item && typeof item.text === "string") {
          try {
            return JSON.parse(item.text);
          } catch {
            // continue
          }
        }
      }
    }
  }
  if (typeof content === "object") {
    return content;
  }
  return null;
}

type RequestBody = {
  jobDescription?: string;
  resumeLatex?: string;
  instructions?: string;
  coverLetterLatex?: string;
  coverLetterInstructions?: string;
  generateCoverLetter?: boolean;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY. Add it to your .env.local file." },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 },
    );
  }

  const jobDescription = body.jobDescription?.toString();
  const resumeLatex = body.resumeLatex?.toString();
  const instructions = body.instructions?.toString();
  const coverLetterLatex = body.coverLetterLatex?.toString();
  const coverLetterInstructions = body.coverLetterInstructions?.toString();
  const generateCoverLetter = Boolean(body.generateCoverLetter);

  if (!jobDescription) {
    return NextResponse.json(
      { error: "Please provide a job description." },
      { status: 400 },
    );
  }

  if (!resumeLatex) {
    return NextResponse.json(
      { error: "Please provide a resume LaTeX template." },
      { status: 400 },
    );
  }

  if (!instructions) {
    return NextResponse.json(
      { error: "Please provide tailoring instructions." },
      { status: 400 },
    );
  }

  try {
    // Reintroduce a concise system guardrail to enforce structure/length while letting user/profile instructions drive content.
    const messages = [
      {
        role: "system",
        content: [
          "You are a LaTeX resume rewriter. Preserve the template’s exact section order, section names, one-page footprint, and line/bullet counts.",
          "Do NOT add or remove lines, bullets, or sections. Keep the exact count of lines and `\\\\` line breaks in each rewritten section.",
          "Each rewritten line must be at least as long as the corresponding template line (allow at most 0–2 characters shorter); if you cannot meet that, copy the template line verbatim instead of shortening.",
          "Target JD alignment around 80-85%; avoid overfitting by retaining 1-2 original skills or phrases where needed.",
          "For Projects, avoid numeric metrics; describe scope and responsibilities without adding numbers or percentages.",
          "If rewriting risks shrinking a line, reuse the template line and only swap in JD terms while keeping the original length and cadence. Never compress bullets or merge/split lines.",
          "Return LaTeX only, wrapped between __OUTPUT_START__ and __OUTPUT_END__.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "RESUME LATEX TEMPLATE (keep structure, rewrite content only):",
          "-----BEGIN TEMPLATE-----",
          resumeLatex,
          "-----END TEMPLATE-----",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "TAILORING INSTRUCTIONS (highest priority):",
          instructions,
          "",
          "When wording conflicts arise, prioritize JD keywords and alignment over preserving existing phrasing, while keeping the structure intact.",
          "If a line would become shorter or fewer lines than the template, reuse the template line and only swap in JD keywords that fit. Do not drop metrics or supporting phrases; expand with JD-relevant detail instead of compressing.",
          "Maintain or exceed template line lengths (within 0–2 chars shorter at worst) and aim for ~80-85% JD keyword alignment while leaving a small amount of template flavor. If you cannot meet length, copy the original line exactly.",
          "Return LaTeX only, wrapped between __OUTPUT_START__ and __OUTPUT_END__.",
        ].join("\n"),
      },
      {
        role: "user",
        content: ["JOB DESCRIPTION (verbatim):", jobDescription].join("\n"),
      },
    ];

    const callRewrite = (model: string) =>
      fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages,
          max_tokens: REWRITE_MAX_TOKENS,
        }),
      });

    let response = await callRewrite(PRIMARY_MODEL);
    if (!response.ok) {
      const primaryDetails = await response.text().catch(() => "");
      console.warn(`Primary model ${PRIMARY_MODEL} failed:`, primaryDetails);
      const fallbackResponse = await callRewrite(FALLBACK_MODEL);
      if (!fallbackResponse.ok) {
        const fallbackDetails = await fallbackResponse.text().catch(() => "");
        const details = fallbackDetails || primaryDetails || "Unknown OpenAI error.";
        const status = fallbackResponse.status || response.status;
        const errorMessage =
          status === 401
            ? "OpenAI authentication failed. Check your OPENAI_API_KEY."
            : "OpenAI request failed.";
        return NextResponse.json(
          { error: errorMessage, details },
          { status },
        );
      }
      response = fallbackResponse;
    }

    const data = await response.json();
    const rawReply = toTextContent(data?.choices?.[0]?.message?.content);
    const cleaned = rawReply ? sanitizeOutput(extractWithMarkers(rawReply)) : "";
    const reply = mergeIntoTemplate(cleaned, resumeLatex);

    if (!reply) {
      return NextResponse.json(
        { error: "No response returned from the model." },
        { status: 502 },
      );
    }

    // Second pass: request ATS and interview likelihood scoring based on JD + rewritten resume.
    let atsScore: number | null = null;
    let atsReason: string | null = null;
    let interviewScore: number | null = null;
    let interviewReason: string | null = null;

    try {
      const scoringMessages = [
        {
          role: "system",
          content:
            "You are an ATS evaluator. Given a job description and the rewritten LaTeX resume, return a compact JSON object with ATS and interview scores.",
        },
        {
          role: "user",
          content: [
            "JOB DESCRIPTION:",
            jobDescription,
            "",
            "REWRITTEN RESUME (LaTeX):",
            reply,
            "",
            'Return JSON exactly as: {"ats_score": number 0-100, "ats_reason": "short reason", "interview_score": number 0-100, "interview_reason": "short reason"}',
            "Keep reasons to one sentence each.",
          ].join("\n"),
        },
      ];

      const callScore = (model: string) =>
        fetch(OPENAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            messages: scoringMessages,
            max_tokens: 400,
            response_format: SCORING_RESPONSE_FORMAT,
          }),
        });

      let scoreResp = await callScore(PRIMARY_MODEL);
      if (!scoreResp.ok) {
        const primaryScoreDetails = await scoreResp.text().catch(() => "");
        console.warn(`Primary scoring model ${PRIMARY_MODEL} failed:`, primaryScoreDetails);
        const fallbackScoreResp = await callScore(FALLBACK_MODEL);
        if (fallbackScoreResp.ok) {
          scoreResp = fallbackScoreResp;
        } else {
          const fallbackDetails = await fallbackScoreResp.text().catch(() => "");
          console.warn(
            `Scoring fallback model ${FALLBACK_MODEL} failed:`,
            fallbackDetails || primaryScoreDetails,
          );
        }
      }

      if (scoreResp.ok) {
        const scoreData = await scoreResp.json();
        const content = scoreData?.choices?.[0]?.message?.content;
        if (content) {
          const parsed = parseJsonContent(content);
          const boundedAts =
            typeof parsed?.ats_score === "number"
              ? Math.min(100, Math.max(0, parsed.ats_score))
              : null;
          const boundedInterview =
            typeof parsed?.interview_score === "number"
              ? Math.min(100, Math.max(0, parsed.interview_score))
              : null;
          atsScore = boundedAts;
          atsReason = typeof parsed?.ats_reason === "string" ? parsed.ats_reason : null;
          interviewScore = boundedInterview;
          interviewReason =
            typeof parsed?.interview_reason === "string" ? parsed.interview_reason : null;
          if (atsScore === null || interviewScore === null) {
            console.warn("Scoring JSON missing expected numeric fields:", parsed);
          }
        }
      }
    } catch (scoreErr) {
      console.warn("Error during scoring call:", scoreErr);
    }

    let coverLetter = "";

    if (generateCoverLetter) {
      if (!coverLetterLatex || !coverLetterInstructions) {
        console.warn("Cover letter generation requested but missing template or instructions.");
      } else {
        try {
          const coverLetterMessages = [
            {
              role: "system",
              content: [
                "You are a professional cover letter generator.",
                "Rewrite the provided LaTeX cover letter template so it is tightly aligned to the job description, while preserving the LaTeX structure and one-page footprint.",
                "Do NOT add company location anywhere (header, company block, or body) unless it is already present in the template. Keep the company block limited to the hiring manager and company name only.",
                "Return LaTeX only, wrapped between __OUTPUT_START__ and __OUTPUT_END__.",
                "Keep the existing letter environment, addresses, and formatting intact; update only the content inside the letter to match the JD and provided instructions.",
              ].join("\n"),
            },
            {
              role: "user",
              content: [
                "COVER LETTER LATEX TEMPLATE (keep structure, rewrite content inside):",
                "-----BEGIN TEMPLATE-----",
                coverLetterLatex,
                "-----END TEMPLATE-----",
              ].join("\n"),
            },
            {
              role: "user",
              content: [
                "COVER LETTER INSTRUCTIONS:",
                coverLetterInstructions,
                "",
                "Prioritize JD keywords, company details, and role alignment within the existing structure.",
                "Do not add company location anywhere unless the template already contains it.",
              ].join("\n"),
            },
            {
              role: "user",
              content: ["JOB DESCRIPTION (verbatim):", jobDescription].join("\n"),
            },
          ];

          const coverResp = await fetch(OPENAI_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4.1",
              temperature: 0,
              messages: coverLetterMessages,
              max_tokens: 4000,
            }),
          });

          if (coverResp.ok) {
            const coverData = await coverResp.json();
            const coverRaw = coverData?.choices?.[0]?.message?.content;
            const coverCleaned = coverRaw ? sanitizeOutput(extractWithMarkers(coverRaw)) : "";
            coverLetter = coverCleaned || "";
          } else {
            console.warn("Cover letter generation failed:", await coverResp.text());
          }
        } catch (coverErr) {
          console.warn("Cover letter generation error:", coverErr);
        }
      }
    }

    return NextResponse.json({
      reply,
      coverLetter,
      ats: { score: atsScore, reason: atsReason },
      interview: { score: interviewScore, reason: interviewReason },
    });
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    return NextResponse.json(
      { error: "Unexpected error while contacting OpenAI." },
      { status: 500 },
    );
  }
}
