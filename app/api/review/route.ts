import { NextResponse } from "next/server";

type StageKey =
  | "eligibility"
  | "ats"
  | "behavioral"
  | "authenticity"
  | "ai_content"
  | "genuineness";

const STAGE_CONFIG: Record<
  StageKey,
  { model: "openai_primary" | "openai_mini" | "anthropic"; prompt: string }
> = {
  eligibility: {
    model: "openai_primary",
    prompt:
      "You are an HR Eligibility and Shortlisting Reviewer. Based on the Job Description and the candidate's Resume, give 2–3 short feedback points about whether the candidate meets the mandatory requirements and aligns with responsibilities/preferred skills.",
  },
  ats: {
    model: "openai_mini",
    prompt:
      "You are an ATS and Resume Quality Evaluator. Using the Job Description and the candidate's Resume, give 2–3 short feedback points about ATS compatibility, keyword match quality, and any resume structure or formatting issues.",
  },
  behavioral: {
    model: "anthropic",
    prompt:
      "You are an HR Behavioral and Culture Fit Analyst. Review the Job Description and the candidate's Resume, and give 2–3 short feedback points about communication tone, leadership signals, teamwork indicators, and cultural alignment with the role.",
  },
  authenticity: {
    model: "openai_primary",
    prompt:
      "You are an HR Authenticity Reviewer. Evaluate the candidate’s Resume for realism and credibility, and give 2–3 short feedback points noting any inconsistencies, exaggerations, unrealistic achievements, or signs of over-polished content.",
  },
  ai_content: {
    model: "openai_primary",
    prompt:
      "You are an AI-Content Detection Specialist. Analyze the candidate’s Resume and give 2–3 short feedback points about whether the writing appears AI-generated, overly generic, repetitive, or lacking natural human tone.",
  },
  genuineness: {
    model: "openai_primary",
    prompt:
      "You are an HR Identity & Genuineness Verification Expert. Using the Job Description and the candidate’s Resume, provide 2–3 short feedback points judging whether the candidate appears genuine or potentially fake. Focus on signals such as having every skill exactly matching the JD, being unrealistically overskilled, perfect or exaggerated JD alignment, or unusually polished achievements that do not match natural human career progression.",
  },
};

function parseJsonish(content: string) {
  const cleaned = content
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.pairs && Array.isArray(parsed.pairs)) {
      return {
        status: parsed.status ?? "concern",
        pairs: parsed.pairs,
        prompt: parsed.prompt ?? "",
      };
    }
    if (parsed.bullets && Array.isArray(parsed.bullets)) {
      return {
        status: parsed.status ?? "concern",
        pairs: parsed.bullets.map((b: string) => ({
          jd: "",
          resume: b,
          verdict: parsed.status ?? "concern",
          reason: b,
        })),
        prompt: parsed.prompt ?? "",
      };
    }
    return {
      status: parsed.status ?? "concern",
      pairs: [
        {
          jd: "",
          resume: cleaned,
          verdict: parsed.status ?? "concern",
          reason: cleaned,
        },
      ],
      prompt: parsed.prompt ?? "",
    };
  } catch {
    const fallback = cleaned || "No feedback returned.";
    return {
      status: "concern",
      pairs: [
        {
          jd: "",
          resume: fallback,
          verdict: "concern",
          reason: fallback,
        },
      ],
      prompt: "",
    };
  }
}

type RequestBody = {
  stage: StageKey;
  jobDescription?: string;
  resume?: string;
  prompts?: Partial<Record<StageKey, string>>;
};

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { stage, jobDescription, resume, prompts } = body;
  if (!stage || !STAGE_CONFIG[stage]) {
    return NextResponse.json({ error: "Invalid stage." }, { status: 400 });
  }
  if (!jobDescription || !resume) {
    return NextResponse.json(
      { error: "Both jobDescription and resume are required." },
      { status: 400 },
    );
  }

const config = STAGE_CONFIG[stage];
const customPrompt = prompts?.[stage];
const instructions = `${customPrompt || config.prompt}

Return JSON: {
  "status": "pass" | "concern",
  "pairs": [
    {"jd": "<JD requirement>", "resume": "<matching or missing evidence>", "verdict": "pass|concern", "reason": "<why>"},
    ...
  ],
  "prompt": "<if concern: 3–5 highly specific change instructions to pass this stage; if pass: null or ''>"
}
Rules:
- Provide 4–6 pairs covering all major JD requirements.
- For each pair, specify the exact JD requirement, the resume evidence (or say “missing”), a verdict (pass/concern), and a concise reason (20–35 words).
- Be explicit and non-generic; call out positives and gaps.
- If status is "concern", include 3–5 highly specific, actionable change instructions (15–25 words each) in the prompt, referencing the exact JD requirement and where to add/adjust in the resume; separate each instruction with a newline.`;

  try {
    if (config.model === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "Anthropic API key missing on server." },
          { status: 500 },
        );
      }
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 512,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: [
                    instructions,
                    "",
                    "JOB DESCRIPTION:",
                    jobDescription,
                    "",
                    "RESUME:",
                    resume,
                  ].join("\n"),
                },
              ],
            },
          ],
        }),
      });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      const data = await resp.json();
      const textContent =
        data?.content?.[0]?.text ??
        (Array.isArray(data?.content)
          ? data.content.find((c: { type?: string; text?: string }) => c?.type === "text")?.text
          : null) ??
        "";
      const parsed = parseJsonish(textContent || "");
      return NextResponse.json(parsed);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key missing." }, { status: 500 });
    }
    const model = config.model === "openai_primary" ? "gpt-4.1" : "gpt-4o-mini";
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: instructions },
          {
            role: "user",
            content: [
              "JOB DESCRIPTION:",
              jobDescription,
              "",
              "RESUME:",
              resume,
            ].join("\n"),
          },
        ],
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || "OpenAI request failed.");
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonish(content || "");
    return NextResponse.json(parsed);
  } catch (err) {
    // Fallback if Anthropic fails: try OpenAI primary
    if (config.model === "anthropic" && process.env.OPENAI_API_KEY) {
      try {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4.1",
            messages: [
              { role: "system", content: instructions },
              { role: "user", content: ["JOB DESCRIPTION:", jobDescription, "", "RESUME:", resume].join("\n") },
            ],
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const content = data?.choices?.[0]?.message?.content ?? "";
          const parsed = parseJsonish(content || "");
          return NextResponse.json(parsed);
        }
      } catch (fallbackErr) {
        console.error("Fallback OpenAI failed:", fallbackErr);
      }
    }
    console.error("Stage review failed:", err);
    return NextResponse.json({ error: "Review failed." }, { status: 500 });
  }
}
