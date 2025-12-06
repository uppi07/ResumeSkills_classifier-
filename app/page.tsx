"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "resume_profile_store";
const APPLICATIONS_KEY = "applications_store";
const STAGE_PROMPTS_KEY = "stage_prompts_store";
const DEFAULT_PDF_FILENAME = "Upendra_-_Resume";
const LEGACY_PDF_FILENAMES = ["resume", "Upendra_Dommaraju_[Role]_[Company]_Resume"];

function normalizePdfFileName(name?: string | null) {
  if (!name) return DEFAULT_PDF_FILENAME;
  const trimmed = name.trim().replace(/\.pdf$/i, "");
  if (!trimmed) return DEFAULT_PDF_FILENAME;
  const lower = trimmed.toLowerCase();
  const legacyHit = LEGACY_PDF_FILENAMES.some((legacy) => legacy.toLowerCase() === lower);
  if (legacyHit) return DEFAULT_PDF_FILENAME;
  if (!lower.startsWith(DEFAULT_PDF_FILENAME.toLowerCase())) {
    return DEFAULT_PDF_FILENAME;
  }
  return trimmed;
}
const DEFAULT_COVER_LETTER_FILENAME = "Upendra_-_CoverLetter";
const JOB_PLATFORMS = [
  "LinkedIn",
  "Indeed",
  "ZipRecruiter",
  "Monster",
  "Glassdoor",
  "Dice",
  "Hired",
  "BuiltIn",
  "YC Startup Jobs",
  "H1Bdata.info",
  "Handshake",
  "Other",
] as const;
const JOB_BOARD_LINKS: { name: (typeof JOB_PLATFORMS)[number]; href: string }[] = [
  { name: "LinkedIn", href: "https://www.linkedin.com/jobs" },
  { name: "Indeed", href: "https://www.indeed.com" },
  { name: "ZipRecruiter", href: "https://www.ziprecruiter.com" },
  { name: "Monster", href: "https://www.monster.com" },
  { name: "Glassdoor", href: "https://www.glassdoor.com/Job/index.htm" },
  { name: "Dice", href: "https://www.dice.com" },
  { name: "Hired", href: "https://hired.com" },
  { name: "BuiltIn", href: "https://builtin.com/jobs" },
  { name: "Handshake", href: "https://joinhandshake.com" },
  { name: "YC Startup Jobs", href: "https://www.ycombinator.com/jobs" },
  { name: "H1Bdata.info", href: "https://www.h1bdata.info" },
  { name: "Other", href: "#" },
];

type CopyState = "idle" | "copied" | "failed";
type ReviewStageKey =
  | "eligibility"
  | "ats"
  | "behavioral"
  | "authenticity"
  | "ai_content"
  | "genuineness";

function latexToText(latex: string) {
  if (!latex) return "";
  // Focus only on document content if markers exist
  const beginIdx = latex.indexOf("\\begin{document}");
  const endIdx = latex.lastIndexOf("\\end{document}");
  let text =
    beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx
      ? latex.slice(beginIdx + "\\begin{document}".length, endIdx)
      : latex;
  // Remove LaTeX comments
  text = text.replace(/%.*/g, "");
  // Convert common section commands to headings
  text = text.replace(/\\section\*?\{([^}]*)\}/g, "$1\n");
  text = text.replace(/\\subsection\*?\{([^}]*)\}/g, "$1\n");
  // Escape sequences
  text = text.replace(/\\%/g, "%");
  // Bold/italic cleanup
  text = text.replace(/\\textbf\{([^}]*)\}/g, "$1");
  text = text.replace(/\\textit\{([^}]*)\}/g, "$1");
  // Bullet markers
  text = text.replace(/\\item\s*/g, "• ");
  // Line breaks
  text = text.replace(/\\\\/g, "\n");
  // Remove remaining LaTeX commands while keeping their content
  text = text.replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{([^}]*)\})?/g, "$1");
  // Remove braces
  text = text.replace(/[{}]/g, "");
  // Collapse extra whitespace
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

const DEFAULT_STAGE_PROMPTS: Record<ReviewStageKey, string> = {
  eligibility:
    "You are an HR Eligibility and Shortlisting Reviewer. Based on the Job Description and the candidate's Resume, give 2–3 short feedback points about whether the candidate meets the mandatory requirements and aligns with responsibilities/preferred skills.",
  ats:
    "You are an ATS and Resume Quality Evaluator. Using the Job Description and the candidate's Resume, give 2–3 short feedback points about ATS compatibility, keyword match quality, and any resume structure or formatting issues.",
  behavioral:
    "You are an HR Behavioral and Culture Fit Analyst. Review the Job Description and the candidate's Resume, and give 2–3 short feedback points about communication tone, leadership signals, teamwork indicators, and cultural alignment with the role.",
  authenticity:
    "You are an HR Authenticity Reviewer. Evaluate the candidate’s Resume for realism and credibility, and give 2–3 short feedback points noting any inconsistencies, exaggerations, unrealistic achievements, or signs of over-polished content.",
  ai_content:
    "You are an AI-Content Detection Specialist. Analyze the candidate’s Resume and give 2–3 short feedback points about whether the writing appears AI-generated, overly generic, repetitive, or lacking natural human tone.",
  genuineness:
    "You are an HR Identity & Genuineness Verification Expert. Using the Job Description and the candidate’s Resume, provide 2–3 short feedback points judging whether the candidate appears genuine or potentially fake. Focus on signals such as having every skill exactly matching the JD, being unrealistically overskilled, perfect or exaggerated JD alignment, or unusually polished achievements that do not match natural human career progression.",
};

const REVIEW_STAGES: { label: string; key: ReviewStageKey | "stage1" | "stage2" }[] = [
  { label: "JD Pasted", key: "stage1" },
  { label: "Resume Created", key: "stage2" },
  { label: "Eligibility & Shortlisting Review", key: "eligibility" },
  { label: "Resume & ATS Review", key: "ats" },
  { label: "Behavioral & Culture Fit Review", key: "behavioral" },
  { label: "Resume Authenticity Check", key: "authenticity" },
  { label: "AI-Generated Content Check", key: "ai_content" },
  { label: "Candidate Genuineness Verification", key: "genuineness" },
];
const ACTIVE_REVIEW_KEYS: ReviewStageKey[] = [
  "eligibility",
  "ats",
  "behavioral",
  "authenticity",
  "ai_content",
  "genuineness",
];

const LENGTH_POLICY = [
  "Keep the rewritten resume to exactly one page and the same vertical footprint as the provided LaTeX template.",
  "Preserve every section, bullet, and line count exactly as in the provided LaTeX; do not remove, merge, shorten, or reflow lines.",
  "Keep the same number of bullets per role and the same number of lines per bullet; keep the same number of skill items per group.",
  "If anything risks becoming shorter, expand with JD-relevant, authentic detail instead of deleting or compressing.",
  "Do not add new sections or spacing; only replace text in-place while keeping the total line count unchanged.",
].join("\n");

export default function Home() {
  const [jobDescription, setJobDescription] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [applicationsOpen, setApplicationsOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  // JD insights removed
  const [outputTab, setOutputTab] = useState<"latex" | "pdf" | "text">("latex");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewAttempted, setPreviewAttempted] = useState(false);
  const [generateCoverLetter, setGenerateCoverLetter] = useState(false);
  const [coverOutputTab, setCoverOutputTab] = useState<"latex" | "pdf">("latex");
  const [coverPdfPreviewUrl, setCoverPdfPreviewUrl] = useState<string | null>(null);
  const [isCoverPreviewLoading, setIsCoverPreviewLoading] = useState(false);
  const [coverPreviewError, setCoverPreviewError] = useState("");
  const [coverPreviewAttempted, setCoverPreviewAttempted] = useState(false);
  const [currentPlatform, setCurrentPlatform] = useState<(typeof JOB_PLATFORMS)[number]>("LinkedIn");
  const [resumeLatex, setResumeLatex] = useState(
    [
      "\\documentclass[a4paper,10pt]{article}",
      "",
      "% Packages",
      "\\usepackage{latexsym}",
      "\\usepackage{enumitem}",
      "\\usepackage{titlesec}",
      "\\usepackage{geometry}",
      "\\usepackage{hyperref}",
      "\\usepackage{tabularx}",
      "",
      "% Font: Times New Roman (text + math)",
      "\\usepackage{newtxtext}",
      "\\usepackage{newtxmath}",
      "",
      "% Page Setup",
      "\\geometry{top=0.6cm, bottom=0.6cm, left=0.8cm, right=0.8cm}",
      "\\pagestyle{empty}",
      "\\setlength{\\parindent}{0pt}",
      "\\setlength{\\parskip}{1pt}",
      "",
      "% Section Formatting",
      "\\titlespacing{\\section}{0pt}{4pt}{3pt}",
      "\\titleformat{\\section}{\\bfseries\\large}{}{0em}{}[\\titlerule]",
      "",
      "% Item Layout",
      "\\setlist[itemize]{",
      "    left=0.55cm,",
      "    itemsep=2pt,",
      "    topsep=1pt,",
      "    parsep=0pt,",
      "    labelsep=0.3cm",
      "}",
      "",
      "\\newcommand{\\exptext}{\\fontsize{10.3pt}{12.3pt}\\selectfont}",
      "",
      "\\begin{document}",
      "",
      "% =========================",
      "% HEADER",
      "% =========================",
      "\\begin{center}",
      "{\\LARGE \\textbf{Upendra Dommaraju}}\\\\",
      "Chicago, Illinois \\,|\\, +1 (937) 608-2488 \\,|\\, \\href{mailto:Uppiupendra13@gmail.com}{Uppiupendra13@gmail.com}",
      "\\end{center}",
      "",
      "\\vspace{-0.2cm}",
      "",
      "% =========================",
      "% OBJECTIVE",
      "% =========================",
      "\\section*{Objective}",
      "Software Engineer specializing in backend development, distributed systems, and cloud-native architectures. Experienced in building large-scale services, microservices-based platforms, and intelligent automation systems used by tens of thousands of users. Strong in system design, high-availability architectures, and delivering performance-optimized, scalable solutions across enterprise environments.",
      "Focused on AI-driven automation, reliability, and measurable impact across latency, scalability, and operational excellence for enterprise-grade products.",
      "",
      "% =========================",
      "% TECHNICAL SKILLS",
      "% =========================",
      "\\section*{Technical Skills}",
      "\\textbf{Programming:} Java, Python, JavaScript, TypeScript, SQL \\\\",
      "\\textbf{Backend Engineering:} Spring Boot, Microservices, REST APIs, Node.js, Express.js, System Design, Distributed Systems, Architectural Patterns \\\\",
      "\\textbf{Frontend:} React.js, Next.js, TypeScript \\\\",
      "\\textbf{Cloud \\& DevOps:} AWS (Lambda, ECS, EC2, API Gateway, DynamoDB, RDS), Docker, CI/CD, GitHub Actions, Cloud Architecture, DevOps \\\\",
      "\\textbf{AI \\& Machine Learning:} OpenAI API, Machine Learning, Deep Learning, NumPy, Pandas \\\\",
      "\\textbf{Databases:} PostgreSQL, Redis, Prisma \\\\",
      "\\textbf{Core Computer Science:} Data Structures \\& Algorithms, OOP, Algorithm Design, Operating Systems, Problem Solving",
      "",
      "% =========================",
      "% EXPERIENCE",
      "% =========================",
      "\\section*{Experience}",
      "",
      "\\textbf{Capgemini} \\hfill Bangalore, India \\\\",
      "\\textit{Senior Software Engineer} \\hfill Oct 2022 -- Jan 2024",
      "{\\exptext",
      "\\begin{itemize}",
      "    \\item Designed and delivered large-scale enterprise services, improving API latency by 40\\% across distributed systems and maintaining high reliability under peak load.",
      "    \\item Built and optimized backend modules supporting 50K+ users, implementing orchestration, request routing, and failover mechanisms for uninterrupted service operation.",
      "    \\item Introduced AI-driven automation into mission-critical workflows, reducing manual intervention by 60\\% and accelerating internal processing efficiency.",
      "    \\item Enabled daily zero-downtime releases through modularization and modernization of legacy components.",
      "    \\item Improved platform responsiveness by reducing database pressure by 35\\% through advanced caching strategies.",
      "\\end{itemize}",
      "}",
      "",
      "\\textbf{Accenture} \\hfill Chennai, India \\\\",
      "\\textit{Associate Software Engineer} \\hfill Aug 2019 -- Sep 2022",
      "{\\exptext",
      "\\begin{itemize}",
      "    \\item Built full-stack features serving 20K+ users, optimizing end-to-end logic, data flow, and UI responsiveness to enhance system reliability.",
      "    \\item Improved user experience by redesigning front-end flows, reducing average page-load times by 45\\% and delivering smoother interactions across the platform.",
      "    \\item Developed secure, high-availability service endpoints used across multiple internal teams, ensuring consistent behavior and fault isolation under heavy load.",
      "    \\item Achieved sub-100ms API responses through performance profiling, caching enhancements, and backend tuning.",
      "    \\item Delivered features with 95\\% sprint reliability while strengthening system observability and reducing debugging time.",
      "\\end{itemize}",
      "}",
      "",
      "% =========================",
      "% PROJECTS",
      "% =========================",
      "\\section*{Projects}",
      "",
      "\\textbf{Intelligent Workflow Automation Platform} \\hfill 2024 - Present \\\\",
      "Built a scalable automation engine processing 2M+ monthly tasks with dynamic rule evaluation, orchestration layers, and event-driven triggers. Integrated AI-driven decision flows reducing manual operations by 55\\% and improving execution reliability across distributed environments.",
      "Delivered hardened runbooks, monitoring, and rollback paths to keep uptime high during rapid feature delivery and model updates.",
      "",
      "\\textbf{Real-Time Analytics and Monitoring System} \\hfill 2024 - Present \\\\",
      "Developed a real-time ingestion and monitoring system using event-streaming, metrics aggregation, and dashboards. Reduced incident detection time by 60\\% and enabled proactive alerting across production services.",
      "Implemented anomaly detection and on-call playbooks that cut MTTR by automating triage and surfacing root causes faster.",
      "",
      "\\textbf{User Management and Access Control System} \\hfill 2023 \\\\",
      "Built a full-stack authentication and authorization system with multi-level roles, access policies, and activity tracking. Reduced permission-related issues by 30\\% and improved onboarding workflows.",
      "Added auditing, alerting, and periodic access reviews to strengthen compliance while keeping admin overhead low.",
      "",
      "\\textbf{Enterprise-Grade API Gateway Layer} \\hfill 2023 \\\\",
      "Implemented a centralized API gateway enabling rate limiting, request filtering, authentication, and cross-service communication. Enhanced platform reliability and enabled unified governance across backend services.",
      "Rolled out staged deployment policies and health probes that improved rollout safety and reduced incident blast radius.",
      "",
      "% =========================",
      "% EDUCATION",
      "% =========================",
      "\\section*{Education}",
      "\\textbf{University of Dayton} \\hfill Dayton, OH \\\\",
      "Master of Science in Computer Science \\hfill Jan 2024 -- Dec 2025",
      "",
      "% =========================",
      "% CERTIFICATIONS",
      "% =========================",
      "\\section*{Certifications}",
      "Problem Solving (HackerRank) \\quad | \\quad Java (HackerRank) \\quad | \\quad SQL Advanced \\quad | \\quad Software Engineer (HackerRank)",
      "",
      "\\end{document}",
    ].join("\n"),
  );
  const [coverLetterLatex, setCoverLetterLatex] = useState(
    [
      "\\documentclass{letter}",
      "\\signature{Your Name}",
      "\\address{City, State}",
      "\\begin{document}",
      "\\begin{letter}{Company Name\\\\Attn: Hiring Manager}",
      "\\opening{Dear Hiring Manager,}",
      "I am excited to apply for the role and align my experience with the responsibilities outlined in the job description.",
      "\\closing{Sincerely,}",
      "\\end{letter}",
      "\\end{document}",
    ].join("\n"),
  );
  const [coverLetterInstructions, setCoverLetterInstructions] = useState(
    [
      "• Keep to one page and match the JD role/title explicitly.",
      "• Lead with alignment: domain, tools, and top responsibilities from the JD.",
      "• Use one strong metric/example that maps to the JD’s core outcome.",
      "• Close with availability and interest tailored to the company/role.",
      "• Do NOT add company location anywhere unless the template already contains it.",
      "• No hardcoded company/role details; use only what’s in the JD. If missing, omit rather than invent.",
      "• Keep it concise, ATS-friendly; avoid clichés and filler.",
      "• Match tone to JD (corporate vs startup vs research) in a U.S.-corporate readable style.",
      "• Pull from Capgemini, Accenture, MSCS, RecruiteMee only when relevant to the JD; omit irrelevant items.",
      "• Emphasize measurable impact when true (latency, scale, reliability, users); don’t fabricate metrics.",
      "• Mention RecruiteMee components only when they map to the JD (auth, referrals, payments, Prisma/Postgres, Next.js/Tailwind, etc.).",
      "• Signal immediate availability to start and contribute.",
      "• Highlight pattern-recognition and problem-solving mindset; adaptability to fast or ambiguous environments.",
      "• Keep tone fast, curious, and biased toward shipping while staying concise.",
      "• Make the closing short and punchy while remaining professional.",
      "• Let the JD dictate what to include; every paragraph should reference at least one JD-specific requirement or keyword.",
      "• Keep intro and why-company to 2–3 sentences each; closing to one sentence that includes immediate availability.",
    ].join("\n"),
  );
  const [coverLetterReply, setCoverLetterReply] = useState("");
  const [coverLetterError, setCoverLetterError] = useState("");
  const [coverCopyStatus, setCoverCopyStatus] = useState<CopyState>("idle");
  const [isCoverLetterDownloading, setIsCoverLetterDownloading] = useState(false);
  const [coverLetterDownloadError, setCoverLetterDownloadError] = useState("");
  const [coverLetterFileName, setCoverLetterFileName] = useState(
    DEFAULT_COVER_LETTER_FILENAME,
  );
  const [profileInstructions, setProfileInstructions] = useState(
    [
      "• Keep bullet points concise and impact-focused.",
      "• Highlight metrics (%, $, time saved) wherever possible.",
      "• Tailor language to the job description keywords.",
      "• Prefer active voice and strong verbs.",
    ].join("\n"),
  );
  const [pdfFileName, setPdfFileName] = useState(DEFAULT_PDF_FILENAME);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [copyStatus, setCopyStatus] = useState<CopyState>("idle");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">(
    "idle",
  );
  const [atsScore, setAtsScore] = useState<number | null>(null);
  const [atsReason, setAtsReason] = useState<string | null>(null);
  const [interviewScore, setInterviewScore] = useState<number | null>(null);
  const [interviewReason, setInterviewReason] = useState<string | null>(null);
  // JD extracts removed; no insights state used
  const [applications, setApplications] = useState<
    {
      id: string;
      company: string;
      createdAt: string;
      status: "Applied" | "Shortlisted" | "Interviewing";
      ats?: number | null;
      interview?: number | null;
      resumeLatex: string;
      coverLetter?: string;
      platform?: string;
      jobDescription?: string | null;
      thirdParty?: boolean;
    }[]
  >([]);
  const [checkOwnResume, setCheckOwnResume] = useState(false);
  const [ownJobDescription, setOwnJobDescription] = useState("");
  const [ownResume, setOwnResume] = useState("");
  const [resumeUploadError, setResumeUploadError] = useState("");
  const [resumeUploadStatus, setResumeUploadStatus] = useState("");
  const [applicationsSearch, setApplicationsSearch] = useState("");
  const [stageFeedback, setStageFeedback] = useState<
    Record<
      string,
      {
        loading: boolean;
        error: string;
        status?: string;
        pairs?: { jd: string; resume: string; verdict: string; reason: string }[];
        prompt?: string;
        bullets?: string[];
      }
    >
  >({});
  const [promptView, setPromptView] = useState<Record<string, boolean>>({});
  const [stagePrompts, setStagePrompts] = useState<Record<ReviewStageKey, string>>(DEFAULT_STAGE_PROMPTS);
  const [promptSaveStatus, setPromptSaveStatus] = useState<Record<string, "idle" | "saved">>({});
  const [applicationSaveStatus, setApplicationSaveStatus] = useState<"" | "saved">("");
  const [isReRunningReviews, setIsReRunningReviews] = useState(false);
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [autoFixMessage, setAutoFixMessage] = useState("");
  const [personalHrOpen, setPersonalHrOpen] = useState(false);
  const [resolveMode, setResolveMode] = useState(false);
  const [resolveEdits, setResolveEdits] = useState<Record<string, string>>({});
  const [autoReviewRunId, setAutoReviewRunId] = useState(0);
  const [reviewProgress, setReviewProgress] = useState(0);

  const mapApiApplication = (app: any) => ({
    id: app.id,
    company: app.company ?? "",
    createdAt: app.createdAt ?? new Date().toISOString(),
    status:
      app.status === "Shortlisted" || app.status === "Interviewing" ? app.status : "Applied",
    ats: app.atsScore ?? app.ats ?? null,
    interview: app.interviewScore ?? app.interview ?? null,
    resumeLatex: app.resumeLatex ?? app.latex ?? "",
    coverLetter: app.coverLetter ?? null,
    platform: app.platform ?? undefined,
    jobDescription: app.jobDescription ?? null,
    thirdParty: Boolean(app.thirdParty),
  });

  useEffect(() => {
    if (copyStatus === "idle") return;
    const timer = setTimeout(() => setCopyStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  useEffect(() => {
    if (coverCopyStatus === "idle") return;
    const timer = setTimeout(() => setCoverCopyStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [coverCopyStatus]);

  useEffect(() => {
    if (pdfPreviewUrl) {
      return () => URL.revokeObjectURL(pdfPreviewUrl);
    }
  }, [pdfPreviewUrl]);

  useEffect(() => {
    if (coverPdfPreviewUrl) {
      return () => URL.revokeObjectURL(coverPdfPreviewUrl);
    }
  }, [coverPdfPreviewUrl]);

  useEffect(() => {
    setPdfPreviewUrl(null);
    setPreviewError("");
    setPreviewAttempted(false);
  }, [reply, pdfFileName, jobDescription]);

  useEffect(() => {
    setCoverPdfPreviewUrl(null);
    setCoverPreviewError("");
    setCoverPreviewAttempted(false);
  }, [coverLetterReply, generateCoverLetter]);

  const runStageFeedback = async (
    stageKey: ReviewStageKey,
    resumeOverride?: string,
    jdOverride?: string,
  ) => {
    setStageFeedback((prev) => ({
      ...prev,
      [stageKey]: { ...(prev[stageKey] || {}), loading: true, error: "" },
    }));
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: stageKey,
          jobDescription: jdOverride ?? jobDescription,
          resume: resumeOverride ?? latexToText(reply),
          prompts: stagePrompts,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed");
      }
      const pairs =
        data.pairs && Array.isArray(data.pairs)
          ? data.pairs
          : data.bullets && Array.isArray(data.bullets)
            ? (data.bullets as string[]).map((b: string) => ({
                jd: "",
                resume: b,
                verdict: data.status ?? "concern",
                reason: b,
              }))
            : undefined;
      const hasConcern = pairs?.some((p: { verdict?: string }) => p.verdict !== "pass") ?? false;
      const derivedStatus = hasConcern ? "concern" : data.status;
      setStageFeedback((prev) => ({
        ...prev,
        [stageKey]: {
          loading: false,
          error: "",
          status: derivedStatus,
          pairs,
          prompt: data.prompt || "",
        },
      }));
      const idx = ACTIVE_REVIEW_KEYS.indexOf(stageKey);
      if (idx !== -1) {
        setReviewProgress((prev) => Math.max(prev, idx + 1));
      }
    } catch (err) {
      setStageFeedback((prev) => ({
        ...prev,
        [stageKey]: {
          loading: false,
          error: err instanceof Error ? err.message : "Failed",
          status: prev[stageKey]?.status,
          bullets: prev[stageKey]?.bullets,
        },
      }));
    }
  };

  const handlePdfUpload = async (file: File) => {
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setResumeUploadError("Please upload a PDF file.");
      return;
    }
    setResumeUploadError("");
    setResumeUploadStatus("Extracting text from PDF…");
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Use default build; disable worker and rely on bundled fallback.
      const pdfjsLib = await import("pdfjs-dist");
      const loadingTask = (pdfjsLib as any).getDocument({
        data: new Uint8Array(arrayBuffer),
        useWorker: false,
      });
      const pdf = await loadingTask.promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i += 1) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: any) => ("str" in item ? item.str : ""))
          .join(" ");
        fullText += pageText + "\n";
      }
      const cleaned = fullText.trim();
      if (!cleaned) {
        setResumeUploadError(
          "Could not extract text from PDF. Please upload a text-based PDF.",
        );
        setResumeUploadStatus("");
        return;
      }
      setOwnResume(cleaned);
      setResumeUploadStatus("PDF text extracted. Ready to check.");
    } catch (err) {
      console.error(err);
      setResumeUploadError(
        "Failed to extract text from the PDF. Please try another file.",
      );
      setResumeUploadStatus("");
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadFromStorage = (options?: { profile?: boolean; apps?: boolean }) => {
      const shouldLoadProfile = options?.profile ?? true;
      const shouldLoadApps = options?.apps ?? true;

      if (shouldLoadProfile) {
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as {
              resumeLatex?: string;
              coverLetterLatex?: string;
              coverLetterInstructions?: string;
              coverLetterFileName?: string;
              instructions?: string;
              pdfFileName?: string;
              currentPlatform?: string;
            };
            if (parsed.resumeLatex) setResumeLatex(parsed.resumeLatex);
            if (parsed.coverLetterLatex) setCoverLetterLatex(parsed.coverLetterLatex);
            if (parsed.coverLetterInstructions)
              setCoverLetterInstructions(parsed.coverLetterInstructions);
            if (parsed.coverLetterFileName && parsed.coverLetterFileName.trim()) {
              setCoverLetterFileName(parsed.coverLetterFileName.trim());
            }
            if (parsed.instructions) setProfileInstructions(parsed.instructions);
            setPdfFileName(
              normalizePdfFileName(parsed.pdfFileName ?? (parsed as any).resumeFileName),
            );
            if (parsed.currentPlatform) {
              const platformLower = parsed.currentPlatform.trim().toLowerCase();
              const matched = JOB_PLATFORMS.find((p) => p.toLowerCase() === platformLower);
              if (matched) {
                setCurrentPlatform(matched);
              }
            }
          }
        } catch {
          // ignore parse errors
        }
      }

      if (shouldLoadApps) {
        try {
          const storedApps = localStorage.getItem(APPLICATIONS_KEY);
          if (storedApps) {
            const parsed = JSON.parse(storedApps) as {
              id?: string;
              company: string;
              createdAt: string;
              status: "Applied" | "Shortlisted" | "Interviewing";
              ats?: number | null;
              interview?: number | null;
              latex?: string;
              resumeLatex?: string;
              coverLetter?: string;
              platform?: string;
              jobDescription?: string | null;
              thirdParty?: boolean;
            }[];
            setApplications(
              parsed.map((app) => ({
                ...app,
                resumeLatex: app.resumeLatex ?? app.latex ?? "",
              })) as typeof applications,
            );
          }
        } catch {
          // ignore
        }
      }
    };

    const loadFromApi = async () => {
      let profileLoaded = false;
      let appsLoaded = false;
      try {
        const [profileRes, appsRes] = await Promise.all([
          fetch("/api/profile"),
          fetch("/api/applications"),
        ]);

        if (profileRes.ok) {
          const profile = await profileRes.json();
          const hasProfileData =
            Boolean(
              profile?.resumeTemplate ||
                profile?.coverLetterTemplate ||
                profile?.instructions ||
                profile?.coverLetterInstructions ||
                profile?.coverLetterFileName ||
                profile?.resumeFileName ||
                profile?.currentPlatform,
            ) && profile;

          if (hasProfileData) {
            if (profile.resumeTemplate) setResumeLatex(profile.resumeTemplate);
            if (profile.coverLetterTemplate) setCoverLetterLatex(profile.coverLetterTemplate);
            if (profile.coverLetterInstructions)
              setCoverLetterInstructions(profile.coverLetterInstructions);
            if (profile.coverLetterFileName && profile.coverLetterFileName.trim()) {
              setCoverLetterFileName(profile.coverLetterFileName.trim());
            }
            if (profile.instructions) setProfileInstructions(profile.instructions);
            const normalizedResumeFileName = normalizePdfFileName(
              profile.resumeFileName ?? pdfFileName,
            );
            setPdfFileName(normalizedResumeFileName);
            if (profile.currentPlatform) {
              const platformLower = profile.currentPlatform.trim().toLowerCase();
              const matched = JOB_PLATFORMS.find((p) => p.toLowerCase() === platformLower);
              if (matched) {
                setCurrentPlatform(matched);
              }
            }
            try {
              localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                  resumeLatex: profile.resumeTemplate ?? resumeLatex,
                  coverLetterLatex: profile.coverLetterTemplate ?? coverLetterLatex,
                  coverLetterInstructions:
                    profile.coverLetterInstructions ?? coverLetterInstructions,
                  coverLetterFileName: profile.coverLetterFileName ?? coverLetterFileName,
                  instructions: profile.instructions ?? profileInstructions,
                  pdfFileName: normalizedResumeFileName,
                  resumeFileName: normalizedResumeFileName,
                  currentPlatform: profile.currentPlatform ?? currentPlatform,
                }),
              );
            } catch {
              // ignore storage write errors
            }
            profileLoaded = true;
          }
        }

        if (appsRes.ok) {
          const apps = await appsRes.json();
          if (Array.isArray(apps) && apps.length > 0) {
            const mapped = apps.map(mapApiApplication) as typeof applications;
            setApplications(mapped);
            try {
              localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(mapped));
            } catch {
              // ignore
            }
            appsLoaded = true;
          }
        }
      } catch (err) {
        console.error("Failed to load from API", err);
      }

      if (!profileLoaded || !appsLoaded) {
        loadFromStorage({
          profile: !profileLoaded,
          apps: !appsLoaded,
        });
      }
    };

    loadFromStorage();
    loadFromApi();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(applications));
    } catch {
      // ignore
    }
  }, [applications]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STAGE_PROMPTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Record<ReviewStageKey, string>>;
        const merged: Record<ReviewStageKey, string> = { ...DEFAULT_STAGE_PROMPTS, ...parsed };
        setStagePrompts(merged);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STAGE_PROMPTS_KEY, JSON.stringify(stagePrompts));
    } catch {
      // ignore
    }
  }, [stagePrompts]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : {};
      parsed.currentPlatform = currentPlatform;
      parsed.pdfFileName = normalizePdfFileName(parsed.pdfFileName ?? pdfFileName);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      // ignore
    }
  }, [currentPlatform, pdfFileName]);


  // Deterministic ATS scoring was removed; scores now come from the API response only.

  useEffect(() => {
    const loadPreview = async () => {
      if (
        isPreviewLoading ||
        pdfPreviewUrl ||
        !reply ||
        outputTab !== "pdf" ||
        previewAttempted
      ) {
        return;
      }
      setPreviewAttempted(true);
      setIsPreviewLoading(true);
      setPreviewError("");
      try {
        const response = await fetch("/api/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latex: reply,
            filename: pdfFileName?.trim() || DEFAULT_PDF_FILENAME,
          }),
        });
        if (!response.ok) {
          const data = await response
            .json()
            .catch(() => ({ error: "Failed to build preview." }));
          throw new Error(
            data.log || data.details || data.error || "Failed to build preview.",
          );
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPdfPreviewUrl(url);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not build preview.";
        setPreviewError(message);
      } finally {
        setIsPreviewLoading(false);
      }
    };
    loadPreview();
  }, [isPreviewLoading, outputTab, pdfPreviewUrl, reply, pdfFileName, previewAttempted]);

  useEffect(() => {
    const loadCoverPreview = async () => {
      if (
        !generateCoverLetter ||
        isCoverPreviewLoading ||
        coverPdfPreviewUrl ||
        !coverLetterReply ||
        coverOutputTab !== "pdf" ||
        coverPreviewAttempted
      ) {
        return;
      }
      setCoverPreviewAttempted(true);
      setIsCoverPreviewLoading(true);
      setCoverPreviewError("");
      try {
        const response = await fetch("/api/compile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latex: coverLetterReply,
            filename: DEFAULT_COVER_LETTER_FILENAME,
          }),
        });
        if (!response.ok) {
          const data = await response
            .json()
            .catch(() => ({ error: "Failed to build preview." }));
          throw new Error(
            data.log || data.details || data.error || "Failed to build preview.",
          );
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setCoverPdfPreviewUrl(url);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not build preview.";
        setCoverPreviewError(message);
      } finally {
        setIsCoverPreviewLoading(false);
      }
    };
    loadCoverPreview();
  }, [
    generateCoverLetter,
    isCoverPreviewLoading,
    coverPdfPreviewUrl,
    coverLetterReply,
    coverOutputTab,
    coverPreviewAttempted,
  ]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (checkOwnResume) return;
    setError("");
    setReply("");
    setStageFeedback({});
    setReviewProgress(0);
    setCoverLetterReply("");
    setCoverLetterError("");
    setCoverLetterDownloadError("");
    setAtsScore(null);
    setAtsReason(null);
    setInterviewScore(null);
    setInterviewReason(null);
    setPdfFileName(DEFAULT_PDF_FILENAME);

    if (!jobDescription.trim()) {
      setError("Please paste a job description before sending it to GPT.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescription,
          resumeLatex,
          instructions: [profileInstructions, LENGTH_POLICY].join("\n\n"),
          coverLetterLatex,
          coverLetterInstructions,
          generateCoverLetter,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.details || data.error || "The request failed. Try again.");
        return;
      }
      setAtsScore(data?.ats?.score ?? null);
      setAtsReason(data?.ats?.reason ?? null);
      setInterviewScore(data?.interview?.score ?? null);
      setInterviewReason(data?.interview?.reason ?? null);
      setReply(data.reply || "");
      if (generateCoverLetter) {
        setCoverLetterReply(data.coverLetter || "");
        if (!data.coverLetter) {
          setCoverLetterError("Cover letter was not generated. Please try again.");
        }
      } else {
        setCoverLetterReply("");
      }
    } catch (requestError) {
      console.error("Failed to reach the API:", requestError);
      setError("We could not reach the API. Check your network and try again.");
      if (generateCoverLetter) {
        setCoverLetterError("Cover letter request failed.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutoFix = async () => {
    if (!jobDescription.trim() || !resumeLatex.trim()) return;
    setIsAutoFixing(true);
    setAutoFixMessage("");
    setError("");
    setStageFeedback({});
    setReviewProgress(0);
    setCoverLetterReply("");
    setCoverLetterError("");
    setCoverLetterDownloadError("");
    setAtsScore(null);
    setAtsReason(null);
    setInterviewScore(null);
    setInterviewReason(null);

    const fixInstructions = ACTIVE_REVIEW_KEYS.flatMap((k) => {
      const sf = stageFeedback[k];
      const pairs = sf?.pairs || [];
      const pairTexts = pairs
        .filter((p) => p.verdict !== "pass")
        .map((p) => `JD: ${p.jd || ""} | Reason: ${p.reason || ""}`);
      const promptText = sf?.prompt || "";
      if (pairTexts.length === 0 && !promptText) return [];
      return [`Stage ${k}:`, promptText, ...pairTexts];
    }).join("\n");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescription,
          resumeLatex,
          instructions: [profileInstructions, LENGTH_POLICY, fixInstructions]
            .filter(Boolean)
            .join("\n\n"),
          coverLetterLatex,
          coverLetterInstructions,
          generateCoverLetter: false,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.details || data.error || "The request failed. Try again.");
        return;
      }
      setAtsScore(data?.ats?.score ?? null);
      setAtsReason(data?.ats?.reason ?? null);
      setInterviewScore(data?.interview?.score ?? null);
      setInterviewReason(data?.interview?.reason ?? null);
      setReply(data.reply || "");
      setAutoFixMessage("Resume updated with changes.");
    } catch (err) {
      setError("Auto-fix failed. Please try again.");
    } finally {
      setIsAutoFixing(false);
    }
  };

  const handleSaveProfile = () => {
    const payload = {
      resumeTemplate: resumeLatex,
      coverLetterTemplate: coverLetterLatex,
      coverLetterInstructions,
      coverLetterFileName,
      instructions: profileInstructions,
      resumeFileName: normalizePdfFileName(pdfFileName),
      currentPlatform,
    };
    const storagePayload = { ...payload, pdfFileName: payload.resumeFileName };

    const persist = async () => {
      try {
        const response = await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error("Failed to save profile.");
        }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(storagePayload));
        } catch {
          // ignore storage errors
        }
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      } finally {
        setTimeout(() => setSaveStatus("idle"), 2000);
      }
    };

    void persist();
  };

  const handleDownloadPdf = async () => {
    if (!reply) {
      setDownloadError("Generate the LaTeX first, then download the PDF.");
      return;
    }
    setDownloadError("");
    setIsDownloading(true);
    try {
      const desiredName = pdfFileName?.trim() || DEFAULT_PDF_FILENAME;
      const response = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex: reply, filename: desiredName }),
      });
      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => ({ error: "Failed to compile PDF." }));
        throw new Error(data.details || data.error || data.log || "Failed to compile PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${desiredName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadErr) {
      const message =
        downloadErr instanceof Error
          ? downloadErr.message
          : "Could not download PDF.";
      setDownloadError(message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadCoverLetter = async () => {
    if (!coverLetterReply) {
      setCoverLetterDownloadError("Generate the cover letter first.");
      return;
    }
    setCoverLetterDownloadError("");
    setIsCoverLetterDownloading(true);
    try {
      const desiredName = coverLetterFileName?.trim() || DEFAULT_COVER_LETTER_FILENAME;
      const response = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex: coverLetterReply, filename: desiredName }),
      });
      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => ({ error: "Failed to compile PDF." }));
        throw new Error(data.details || data.error || data.log || "Failed to compile PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${desiredName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadErr) {
      const message =
        downloadErr instanceof Error
          ? downloadErr.message
          : "Could not download cover letter PDF.";
      setCoverLetterDownloadError(message);
    } finally {
      setIsCoverLetterDownloading(false);
    }
  };

  const handleViewCoverLetter = async () => {
    if (!coverLetterReply) {
      alert("Generate the cover letter first.");
      return;
    }
    try {
      const desiredName = coverLetterFileName?.trim() || DEFAULT_COVER_LETTER_FILENAME;
      const response = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex: coverLetterReply, filename: desiredName }),
      });
      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => ({ error: "Failed to compile PDF." }));
        throw new Error(data.details || data.error || data.log || "Failed to compile PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : "Could not view cover letter PDF.";
      alert(message);
    }
  };

  const handleAddApplication = async () => {
    if (!reply) {
      setError("Generate the resume before adding an application.");
      return;
    }
    const name = window.prompt("Enter Company Name:");
    if (!name || !name.trim()) {
      return;
    }
    const normalizedName = name.trim().toLowerCase();
    const alreadyExists = applications.some(
      (app) => app.company.trim().toLowerCase() === normalizedName,
    );
    if (
      alreadyExists &&
      !window.confirm(
        `You already have an application for "${name.trim()}". Add another for this company?`,
      )
    ) {
      return;
    }
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: name.trim(),
          status: "Applied",
          platform: currentPlatform || "LinkedIn",
          resumeLatex: reply,
          coverLetter:
            generateCoverLetter && coverLetterReply.trim() ? coverLetterReply : null,
          jobDescription: jobDescription?.trim() || null,
          atsScore: atsScore ?? null,
          interviewScore: interviewScore ?? null,
          createdAt: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save application.");
      }
      const created = mapApiApplication(await response.json());
      setApplications((prev) => [created as (typeof applications)[number], ...prev]);
      setApplicationSaveStatus("saved");
      setTimeout(() => setApplicationSaveStatus(""), 2000);
    } catch (err) {
      console.error(err);
      setError("Could not save application. Please try again.");
      setApplicationSaveStatus("");
    }
  };

  const handleAddManualApplication = async () => {
    const resumeText = ownResume.trim();
    const jdText = ownJobDescription.trim();
    if (!jdText) {
      setError("Please paste a job description.");
      return;
    }
    if (!resumeText) {
      setError("Please paste your resume text.");
      return;
    }
    const name = window.prompt("Enter Company Name:");
    if (!name || !name.trim()) return;
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: name.trim(),
          status: "Applied",
          platform: null,
          resumeLatex: resumeText,
          coverLetter: null,
          jobDescription: jdText,
          atsScore: null,
          interviewScore: null,
          createdAt: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save application.");
      }
      const created = mapApiApplication(await response.json());
      setApplications((prev) => [
        { ...(created as (typeof applications)[number]), thirdParty: true },
        ...prev,
      ]);
      setError("");
      setApplicationSaveStatus("saved");
      setTimeout(() => setApplicationSaveStatus(""), 2000);
    } catch (err) {
      console.error(err);
      setError("Could not save application. Please try again.");
      setApplicationSaveStatus("");
    }
  };

  const handleUpdateApplication = async (
    id: string,
    updates: Partial<{ status: "Applied" | "Shortlisted" | "Interviewing"; platform?: string }>,
  ) => {
    const previousList = [...applications];
    setApplications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
    try {
      const response = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: updates.status,
          platform: updates.platform,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update application.");
      }
      const updated = mapApiApplication(await response.json());
      setApplications((prev) =>
        prev.map((item) =>
          item.id === id ? { ...(updated as (typeof applications)[number]), thirdParty: item.thirdParty } : item,
        ),
      );
    } catch (err) {
      console.error(err);
      setError("Could not update application. Please try again.");
      setApplications(previousList);
    }
  };

  const handleDeleteApplication = async (id: string) => {
    const previousList = [...applications];
    setApplications((prev) => prev.filter((item) => item.id !== id));
    try {
      const response = await fetch(`/api/applications/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete application.");
      }
    } catch (err) {
      console.error(err);
      setError("Could not delete application. Please try again.");
      setApplications(previousList);
    }
  };

  const dailyApplicationStats = useMemo(() => {
    const counts: Record<string, number> = {};
    applications.forEach((app) => {
      const day = new Date(app.createdAt).toLocaleDateString();
      counts[day] = (counts[day] || 0) + 1;
    });
    const entries = Object.entries(counts).sort(
      (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime(),
    );
    return entries.map(([day, count]) => ({ day, count, remaining: Math.max(50 - count, 0) }));
  }, [applications]);
  const todayStr = new Date().toLocaleDateString();

  const handleDownloadApplication = async (latex: string, company: string) => {
    try {
      const response = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex, filename: company || "resume" }),
      });
      if (!response.ok) {
        throw new Error("Failed to compile PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${company || "resume"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Could not download PDF for this application.");
    }
  };

  const handleDownloadApplicationCover = async (latex: string, company: string) => {
    try {
      const desiredName = company?.trim() || coverLetterFileName?.trim() || DEFAULT_COVER_LETTER_FILENAME;
      const response = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latex,
          filename: desiredName,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to compile PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${desiredName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Could not download cover letter PDF for this application.");
    }
  };

  const handleViewApplication = async (latex: string, company: string) => {
    try {
      const response = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex, filename: company || DEFAULT_PDF_FILENAME }),
      });
      if (!response.ok) {
        throw new Error("Failed to compile PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error(err);
      alert("Could not view PDF for this application.");
    }
  };

  const handleViewApplicationCover = async (latex: string, company: string) => {
    try {
      const response = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latex,
          filename: company || DEFAULT_COVER_LETTER_FILENAME,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to compile PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error(err);
      alert("Could not view cover letter PDF for this application.");
    }
  };

  const handleCopyLatex = async () => {
    if (!reply) {
      setCopyStatus("failed");
      return;
    }
    try {
      await navigator.clipboard.writeText(reply);
      setCopyStatus("copied");
    } catch (err) {
      console.error(err);
      setCopyStatus("failed");
    }
  };

  const handleCopyCover = async () => {
    if (!coverLetterReply) {
      setCoverCopyStatus("failed");
      return;
    }
    try {
      await navigator.clipboard.writeText(coverLetterReply);
      setCoverCopyStatus("copied");
    } catch (err) {
      console.error(err);
      setCoverCopyStatus("failed");
    }
  };

  return (
    <>
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <div className="mx-auto flex w-full max-w-none flex-col gap-10 px-6 py-12 md:px-10 lg:px-16">
        <nav className="sticky top-4 z-20 flex items-center justify-between rounded-full border border-white/10 bg-slate-950/80 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_0_6px_rgba(16,185,129,0.2)]" />
            <div className="flex flex-col leading-tight">
              <span className="text-lg font-semibold tracking-wide text-indigo-50">
                Upendra
              </span>
              <span className="text-sm text-indigo-100/70">
                Job Application System
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-indigo-100 transition hover:border-indigo-300/60 hover:bg-white/10"
              onClick={() => setApplicationsOpen(true)}
            >
              Jobs Applied
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-indigo-100 transition hover:border-indigo-300/60 hover:bg-white/10"
              onClick={() => setTrackingOpen(true)}
            >
              Daily Breakdown
            </button>
            <button
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-indigo-100 transition hover:border-indigo-300/60 hover:bg-white/10"
            >
              Profile
            </button>
          </div>
        </nav>
        {applicationSaveStatus === "saved" && (
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-emerald-300/40 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-50 shadow-lg shadow-emerald-900/40">
            Job saved!
          </div>
        )}

        {profileOpen && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
            <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl shadow-black/60">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-indigo-200/80">
                    Profile
                  </p>
                  <h2 className="text-xl font-semibold">Default Resume LaTeX Code</h2>
                  <p className="mt-1 text-sm text-indigo-100/70">
                    Keep your baseline template and writing guidelines here.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-indigo-100 transition hover:border-indigo-300/60 hover:bg-white/10"
                >
                  Back to app
                </button>
              </div>

              <div className="mt-5 space-y-3">
                <label className="text-sm text-indigo-100/80" htmlFor="resume-latex">
                  Resume LaTeX
                </label>
                <textarea
                  id="resume-latex"
                  value={resumeLatex}
                  onChange={(event) => setResumeLatex(event.target.value)}
                  className="min-h-[180px] w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-sm text-indigo-50 caret-indigo-300 outline-none transition focus:border-indigo-400/80 focus:ring-2 focus:ring-indigo-500/50"
                />
                <div className="space-y-2 pt-2">
                  <label className="text-sm text-indigo-100/80" htmlFor="cover-letter-latex">
                    Cover Letter LaTeX
                  </label>
                  <textarea
                    id="cover-letter-latex"
                    value={coverLetterLatex}
                    onChange={(event) => setCoverLetterLatex(event.target.value)}
                    className="min-h-[140px] w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-sm text-indigo-50 caret-indigo-300 outline-none transition focus:border-indigo-400/80 focus:ring-2 focus:ring-indigo-500/50"
                    placeholder="Paste or edit your cover letter LaTeX template."
                  />
                </div>
                <div className="space-y-2 pt-2">
                  <label
                    className="text-sm text-indigo-100/80"
                    htmlFor="cover-letter-instructions"
                  >
                    Cover Letter Instructions
                  </label>
                  <textarea
                    id="cover-letter-instructions"
                    value={coverLetterInstructions}
                    onChange={(event) => setCoverLetterInstructions(event.target.value)}
                    className="min-h-[140px] w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-indigo-50 caret-indigo-300 outline-none transition focus:border-indigo-400/80 focus:ring-2 focus:ring-indigo-500/50"
                    placeholder="Guidance for tailoring cover letters."
                  />
                </div>
                <div className="space-y-2 pt-2">
                  <label className="text-sm text-indigo-100/80" htmlFor="profile-instructions">
                    Instructions
                  </label>
                  <textarea
                    id="profile-instructions"
                    value={profileInstructions}
                    onChange={(event) => setProfileInstructions(event.target.value)}
                    className="min-h-[140px] w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-indigo-50 caret-indigo-300 outline-none transition focus:border-indigo-400/80 focus:ring-2 focus:ring-indigo-500/50"
                    placeholder="Add any personalized instructions for tailoring outputs."
                  />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-indigo-100 transition hover:border-indigo-300/60 hover:bg-white/10"
                  >
                    Save
                  </button>
                  {saveStatus === "saved" && (
                    <span className="text-xs text-emerald-200">Saved.</span>
                  )}
                  {saveStatus === "error" && (
                    <span className="text-xs text-red-200">Save failed.</span>
                  )}
                </div>
              </div>
            </div>
        </div>
      )}


      {personalHrOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl shadow-black/60">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-indigo-100">Personal HR Analysis</p>
                <p className="mt-1 text-sm text-indigo-100/70">Stage-by-stage feedback for the current JD and resume.</p>
              </div>
              <div className="flex items-center gap-2">
                {resolveMode && (
                  <button
                    type="button"
                    onClick={() => setResolveMode(false)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-indigo-100 transition hover:border-indigo-300/60 hover:bg-white/10"
                  >
                    Back to Analysis
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setResolveMode(false);
                    setPersonalHrOpen(false);
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-indigo-100 transition hover:border-indigo-300/60 hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            </div>

            {resolveMode ? (
              <div className="mt-5 max-h-[60vh] space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-indigo-50">Resolve Prompts</p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isReRunningReviews}
                    onClick={async () => {
                      if (!jobDescription.trim()) return;
                      const resumeText =
                        reply && reply.trim().length > 0 ? latexToText(reply) : ownResume;
                      if (!resumeText.trim()) return;
                      setIsReRunningReviews(true);
                      for (const stage of ACTIVE_REVIEW_KEYS) {
                        // use the current prompts; run sequentially
                        // eslint-disable-next-line no-await-in-loop
                        await runStageFeedback(stage, resumeText, jobDescription);
                      }
                      // regenerate resume using the updated prompts/fixes
                      await handleAutoFix();
                      // Recompute resolve prompts based on current concerns
                      setResolveEdits((prev) => {
                        const next: Record<string, string> = {};
                        ACTIVE_REVIEW_KEYS.forEach((k) => {
                          const sf = stageFeedback[k];
                          const hasConcern =
                            sf?.pairs?.some((p) => p.verdict !== "pass") ?? false;
                          if (sf && (sf.status === "concern" || hasConcern)) {
                            next[k] = sf.prompt || prev[k] || "";
                          }
                        });
                        return next;
                      });
                      // If no more concerns, exit resolve mode
                      setTimeout(() => {
                        setResolveEdits((current) => {
                          if (Object.keys(current).length === 0) {
                            setResolveMode(false);
                          }
                          return current;
                        });
                      }, 0);
                      setIsReRunningReviews(false);
                    }}
                    className="rounded-full border border-indigo-300/60 bg-indigo-500/20 px-4 py-2 text-xs font-semibold text-indigo-50 transition hover:border-indigo-300/80 hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isReRunningReviews ? "Re-running…" : "Re-run with prompts"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResolveMode(false);
                      setPersonalHrOpen(false);
                    }}
                    className="rounded-full border border-emerald-300/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:border-emerald-300/80 hover:bg-emerald-500/30"
                  >
                    Resolve
                  </button>
                </div>
                {Object.keys(resolveEdits).length === 0 && (
                  <p className="text-sm text-indigo-100/70">
                    No concern prompts available. Run analysis and check stages with concerns.
                  </p>
                )}
                {Object.entries(resolveEdits).map(([key, value]) => (
                  <div key={`resolve-${key}`} className="space-y-2 rounded-xl border border-white/10 bg-black/25 p-3">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-indigo-200/80">{key.replace("_", " ")}</p>
                    <textarea
                      value={value}
                      onChange={(e) =>
                        setResolveEdits((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-indigo-50 outline-none transition focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/40"
                      rows={3}
                      placeholder="Add an actionable prompt to pass this stage."
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {(!jobDescription.trim() || !reply.trim()) && (
                  <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-indigo-50">
                    <p className="text-base font-semibold">Pass the JD and Resume to HR Review</p>
                    <p className="mt-1 text-[12px] text-indigo-100/70">
                      Paste a job description and generate a resume to see stage feedback here.
                    </p>
                  </div>
                )}
                {jobDescription.trim() && reply.trim() && (
                  <>
                    {ACTIVE_REVIEW_KEYS.map((key) => {
                      const pairs = stageFeedback[key]?.pairs;
                      const hasConcern = pairs?.some((p) => p.verdict !== "pass") ?? false;
                      const status = hasConcern ? "concern" : stageFeedback[key]?.status;
                      const error = stageFeedback[key]?.error;
                      const promptText = stageFeedback[key]?.prompt;
                      const promptAvailable =
                        typeof promptText === "string" && promptText.trim().length > 0;
                      const statusBadge =
                        status === "pass"
                          ? "border-emerald-300/50 bg-emerald-500/15 text-emerald-50"
                          : status === "concern"
                            ? "border-red-300/50 bg-red-500/15 text-red-50"
                            : "border-white/15 bg-white/10 text-indigo-50";
                      return (
                        <div
                          key={key}
                          className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-indigo-50"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold capitalize">{key.replace("_", " ")}</span>
                            <span className={`rounded-full border px-2 py-[1px] text-[11px] ${statusBadge}`}>
                              {status || "pending"}
                            </span>
                            {stageFeedback[key]?.loading && (
                              <span className="text-[11px] text-indigo-100/70">Loading…</span>
                            )}
                            {error && <span className="text-[11px] text-red-200">{error}</span>}
                          </div>
                      {pairs && (
                        <div className="mt-3 grid gap-3 text-[12px] text-indigo-100/80 sm:grid-cols-2">
                          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <p className="text-[11px] uppercase tracking-wide text-indigo-200/80">JD Requirement</p>
                            <div className="mt-2 space-y-2">
                                  {pairs.map((p, i) => (
                                    <p key={`jd-${key}-${i}`} className="rounded-md bg-black/10 p-2">
                                      {p.jd || "—"}
                                    </p>
                                  ))}
                                </div>
                              </div>
                              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                <p className="text-[11px] uppercase tracking-wide text-indigo-200/80">Resume Evidence & Verdict</p>
                                <div className="mt-2 space-y-3">
                                  {pairs.map((p, i) => (
                                    <div key={`res-${key}-${i}`} className="rounded-md bg-black/10 p-2">
                                      <p>
                                        <span className="font-semibold">Resume:</span> {p.resume || "—"}
                                      </p>
                                      <p className="mt-1">
                                        <span className="font-semibold">Verdict:</span>{" "}
                                        <span
                                          className={`rounded-full border px-2 py-[1px] ${
                                            p.verdict === "pass"
                                              ? "border-emerald-300/50 bg-emerald-500/15 text-emerald-50"
                                              : "border-red-300/50 bg-red-500/15 text-red-50"
                                          }`}
                                        >
                                          {p.verdict || "concern"}
                                        </span>
                                        {p.verdict !== "pass" && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setStageFeedback((prev) => {
                                                const current = prev[key];
                                                if (!current?.pairs) return prev;
                                                const newPairs = current.pairs.map((pair, idx) =>
                                                  idx === i ? { ...pair, verdict: "pass" } : pair,
                                                );
                                                const newStatus = newPairs.every((pair) => pair.verdict === "pass")
                                                  ? "pass"
                                                  : current.status;
                                                const updatedPairs = newPairs;
                                                // remove any concern-specific prompt text referencing this reason
                                                const cleanedPrompt =
                                                  current.prompt && p.reason
                                                    ? current.prompt.replace(p.reason, "").trim()
                                                    : current.prompt;
                                                return {
                                                  ...prev,
                                                  [key]: {
                                                    ...current,
                                                    pairs: updatedPairs,
                                                    status: newStatus,
                                                    prompt: cleanedPrompt,
                                                  },
                                                };
                                              });
                                            }}
                                            className="ml-2 inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-[1px] text-[10px] font-medium text-indigo-50 transition hover:border-emerald-300/60 hover:bg-emerald-500/20"
                                          >
                                            Ignore
                                          </button>
                                        )}
                                      </p>
                                      <p className="mt-1">
                                        <span className="font-semibold">Reason:</span> {p.reason || "—"}
                                      </p>
                                    </div>
                                  ))}
                            </div>
                          </div>
                        </div>
                      )}
                      {status === "concern" && pairs?.length ? (
                        <>
                          <div className="mt-2 rounded-xl border border-red-300/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-50">
                            <p className="font-semibold">Detailed fixes:</p>
                            <ul className="mt-1 list-disc space-y-1 pl-4">
                              {pairs
                                .filter((p) => p.verdict !== "pass")
                                .map((p, i) => (
                                  <li key={`fix-${key}-${i}`}>
                                    <span className="font-semibold">JD:</span> {p.jd || "—"};{" "}
                                    <span className="font-semibold">Reason:</span> {p.reason || "—"}
                                  </li>
                                ))}
                            </ul>
                          </div>
                          <div className="mt-2 rounded-xl border border-red-300/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-50">
                            <p className="font-semibold">How to fix:</p>
                            <p className="mt-1">
                              {promptAvailable
                                ? promptText
                                : "This stage is marked concern, but no fix prompt is available. Adjust your resume to cover the JD gaps shown above."}
                            </p>
                          </div>
                        </>
                      ) : null}
                      {!pairs && !error && !stageFeedback[key]?.loading && (
                        <p className="mt-1 text-[12px] text-indigo-100/60">No feedback yet. Trigger review to populate.</p>
                      )}
                    </div>
                  );
                    })}
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setResolveMode(true);
                          const next: Record<string, string> = {};
                          ACTIVE_REVIEW_KEYS.forEach((k) => {
                            const sf = stageFeedback[k];
                            const hasConcern =
                              sf?.pairs?.some((pair) => pair.verdict !== "pass") ?? false;
                            if (sf && (sf.status === "concern" || hasConcern)) {
                              next[k] = sf.prompt || "";
                            }
                          });
                          setResolveEdits(next);
                        }}
                        className="rounded-full border border-emerald-300/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:border-emerald-300/80 hover:bg-emerald-500/30"
                      >
                        Resolve
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {trackingOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl shadow-black/60">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.32em] text-indigo-100">
                  Daily Breakdown
                </p>
                <p className="mt-1 text-sm text-indigo-100/70">
                  Goal: 50 applications per day. See applied vs remaining.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTrackingOpen(false)}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-indigo-100 transition hover:border-indigo-300/60 hover:bg-white/10"
              >
                Close
              </button>
            </div>
            {dailyApplicationStats.length === 0 ? (
              <p className="mt-6 text-sm text-indigo-100/70">
                No applications yet to track.
              </p>
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {dailyApplicationStats.map((entry) => (
                  // Past days incomplete: red. Completed (50+): green. Current day incomplete: neutral.
                  // This keeps today's in-progress work from showing as a miss until the day ends.
                  // (Assumes toLocaleDateString format is consistent for today comparison.)
                  <div
                    key={entry.day}
                    className={`rounded-2xl p-4 text-sm text-indigo-50 ${
                      entry.count >= 50
                        ? "border border-emerald-300/40 bg-emerald-500/20"
                        : entry.day === todayStr
                          ? "border border-white/10 bg-white/5"
                          : "border border-red-400/40 bg-red-500/15"
                    }`}
                  >
                    <p className="text-[11px] text-indigo-100/70">{entry.day}</p>
                    <p className="text-lg font-semibold">{entry.count} applied</p>
                    {entry.count >= 50 ? (
                      <p className="text-[11px] text-emerald-50">Goal met (50)</p>
                    ) : entry.day === todayStr ? (
                      <p className="text-[11px] text-indigo-100/70">
                        In progress — remaining to 50: {entry.remaining}
                      </p>
                    ) : (
                      <p className="text-[11px] text-red-50">
                        Remaining to 50: {entry.remaining}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
        {applicationsOpen && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
            <div className="relative w-full max-w-5xl max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl shadow-black/60">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.28em] text-indigo-100">
                    Application Tracking
                  </p>
                  <p className="mt-1 text-sm text-indigo-100/70">
                    Saved resumes with scores and statuses.
                  </p>
                </div>
                <div className="text-sm text-indigo-100/80">
                  Total Applications:{" "}
                  <span className="font-semibold text-indigo-50">{applications.length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setApplicationsOpen(false)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-indigo-100 transition hover:border-indigo-300/60 hover:bg-white/10"
                >
                  Close
                </button>
              </div>
              <div className="mt-4">
                <input
                  type="text"
                  value={applicationsSearch}
                  onChange={(e) => setApplicationsSearch(e.target.value)}
                  placeholder="Search companies…"
                  className="w-full rounded-full border border-white/15 bg-black/20 px-3 py-2 text-sm text-indigo-50 outline-none transition focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
              {applications.length === 0 ? (
                <p className="mt-6 text-sm text-indigo-100/70">
                  No applications yet. Generate a resume and click “Add” to track it.
                </p>
              ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {applications
                    .filter((app) =>
                      app.company.toLowerCase().includes(applicationsSearch.toLowerCase()),
                    )
                    .map((app) => (
                    <div
                      key={app.id}
                      className={`rounded-2xl p-4 text-sm text-indigo-50 ${
                        app.thirdParty
                          ? "border border-amber-300/40 bg-amber-500/10"
                          : "border border-white/10 bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold">{app.company}</p>
                          <p className="text-[11px] text-indigo-100/60">
                            Submitted: {new Date(app.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        {!app.thirdParty && (
                          <div className="flex flex-col items-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleDownloadApplication(app.resumeLatex, app.company)}
                              className="rounded-full border border-indigo-300/40 bg-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-100 transition hover:border-indigo-300/70 hover:bg-indigo-500/30"
                            >
                              Download Resume
                            </button>
                            <button
                              type="button"
                              onClick={() => handleViewApplication(app.resumeLatex, app.company)}
                              className="rounded-full border border-indigo-300/40 bg-indigo-500/20 px-3 py-1 text-[11px] font-medium text-indigo-100 transition hover:border-indigo-300/70 hover:bg-indigo-500/30"
                            >
                              View Resume
                            </button>
                            {app.coverLetter && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadApplicationCover(app.coverLetter || "", app.company)
                                }
                                className="rounded-full border border-indigo-300/40 bg-indigo-500/20 px-3 py-1 text-[11px] font-medium text-indigo-100 transition hover:border-indigo-300/70 hover:bg-indigo-500/30"
                              >
                                Download Cover Letter
                              </button>
                            )}
                            {app.coverLetter && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleViewApplicationCover(app.coverLetter || "", app.company)
                                }
                                className="rounded-full border border-indigo-300/40 bg-indigo-500/20 px-3 py-1 text-[11px] font-medium text-indigo-100 transition hover:border-indigo-300/70 hover:bg-indigo-500/30"
                              >
                                View Cover Letter
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-indigo-100/80">
                        <button
                          type="button"
                          onClick={() => handleDeleteApplication(app.id)}
                          className="rounded-full border border-red-400/50 bg-red-500/20 px-2 py-[2px] text-[11px] font-medium text-red-100 transition hover:border-red-300/80 hover:bg-red-500/30"
                        >
                          Delete
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-indigo-100/80">
                        {app.ats !== null && app.ats !== undefined && (
                          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-[2px]">
                            ATS: {app.ats}/100
                          </span>
                        )}
                        {app.interview !== null && app.interview !== undefined && (
                          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-[2px]">
                            Interview: {app.interview}/100
                          </span>
                        )}
                      </div>
                      <div className="mt-3">
                        <label className="text-xs text-indigo-100/70">Status</label>
                        <select
                          value={app.status}
                          onChange={(e) =>
                            handleUpdateApplication(app.id, {
                              status: e.target.value as typeof app.status,
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-xs text-indigo-50 outline-none focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/40"
                        >
                          <option>Applied</option>
                          <option>Shortlisted</option>
                          <option>Interviewing</option>
                        </select>
                      </div>
                      {!app.thirdParty && (
                        <div className="mt-3">
                          <label className="text-xs text-indigo-100/70">Platform</label>
                          <select
                            value={app.platform || "LinkedIn"}
                            onChange={(e) =>
                              handleUpdateApplication(app.id, { platform: e.target.value })
                            }
                            className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-xs text-indigo-50 outline-none focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/40"
                          >
                            {JOB_PLATFORMS.map((platform) => (
                              <option key={platform}>{platform}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="mt-3 space-y-1">
                        <p className="text-xs text-indigo-100/70">
                          {app.thirdParty ? "Job Description" : "Job Description"}
                        </p>
                        {app.jobDescription ? (
                          <div className="max-h-28 overflow-auto rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-indigo-50">
                            {app.jobDescription}
                          </div>
                        ) : (
                          <p className="text-[11px] text-red-200">
                            Job description not available.
                          </p>
                        )}
                        {app.thirdParty && app.resumeLatex && (
                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-indigo-100/70">Pasted Resume</p>
                            <div className="max-h-28 overflow-auto rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-indigo-50">
                              {app.resumeLatex}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <header
          id="job-boards"
          className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-indigo-950/40 backdrop-blur"
        >
          <div className="flex flex-wrap gap-3">
            {JOB_BOARD_LINKS.map(({ name, href }) => {
              const isActive = currentPlatform === name;
              const baseClasses =
                "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition";
              const inactiveClasses =
                "border-white/15 bg-white/5 text-indigo-100 hover:border-indigo-300/60 hover:bg-white/10";
              const activeClasses =
                "border-emerald-300/60 bg-emerald-500/20 text-emerald-50 shadow-[0_0_0_6px_rgba(16,185,129,0.18)]";
              return (
                <a
                  key={name}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
                >
                  {name}
                </a>
              );
            })}
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-indigo-50">
              <span className="text-indigo-100/80">Using:</span>
              <select
                value={currentPlatform}
                onChange={(e) =>
                  setCurrentPlatform(e.target.value as (typeof JOB_PLATFORMS)[number])
                }
                className="rounded-full border border-white/10 bg-black/30 px-2 py-[2px] text-xs text-indigo-50 outline-none focus:border-indigo-400/70 focus:ring-1 focus:ring-indigo-500/40"
              >
                {JOB_PLATFORMS.map((platform) => (
                  <option key={platform}>{platform}</option>
                ))}
              </select>
            </div>
          </div>
        </header>

        <main className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-indigo-950/30 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-indigo-100">
                  Paste your Job Description
                </p>
                <p className="text-sm text-indigo-100/70">
                  Generate an aligned resume. The Flow/HR review has been removed for clarity.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-indigo-100/80">
                <input
                  type="checkbox"
                  checked={generateCoverLetter}
                  onChange={(e) => setGenerateCoverLetter(e.target.checked)}
                  className="h-4 w-4 rounded border-white/30 bg-black/40 text-indigo-500 focus:ring-indigo-400"
                />
                Generate cover letter
              </label>
            </div>
            {error && (
              <div className="rounded-xl border border-red-400/60 bg-red-500/15 px-3 py-2 text-sm text-red-50">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the job description here..."
                className="min-h-[220px] w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-indigo-50 outline-none transition focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/40"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 rounded-full border border-indigo-300/60 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-50 transition hover:border-indigo-300/80 hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? "Generating…" : "Create Resume"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setJobDescription("");
                    setReply("");
                    setCoverLetterReply("");
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-indigo-100 transition hover:border-white/30 hover:bg-white/15"
                >
                  Clear
                </button>
              </div>
            </form>
          </section>

          <section className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-indigo-950/30 backdrop-blur">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-indigo-100">Updated Resume</p>
                <p className="text-sm text-indigo-100/70">View, edit, and save the latest output.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={pdfFileName}
                  onChange={(e) => setPdfFileName(e.target.value)}
                  className="w-36 rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs text-indigo-50 outline-none focus:border-indigo-400/70 focus:ring-1 focus:ring-indigo-500/40"
                  placeholder="File name"
                />
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="rounded-full border border-indigo-300/60 bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-50 transition hover:border-indigo-300/80 hover:bg-indigo-500/30"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleViewApplication(reply || resumeLatex, pdfFileName || "resume")
                  }
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-indigo-100 transition hover:border-indigo-300/60 hover:bg-white/15"
                >
                  View Resume
                </button>
                <button
                  type="button"
                  onClick={handleCopyLatex}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-indigo-100 transition hover:border-indigo-300/60 hover:bg-white/15"
                >
                  {copyStatus === "copied"
                    ? "Copied"
                    : copyStatus === "failed"
                      ? "Copy failed"
                      : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={handleAddApplication}
                  className="rounded-full border border-emerald-300/60 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-50 transition hover:border-emerald-300/80 hover:bg-emerald-500/30"
                >
                  Add
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              {(["latex", "pdf", "text"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setOutputTab(tab)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    outputTab === tab
                      ? "border border-indigo-300/70 bg-indigo-500/20 text-indigo-50"
                      : "border border-white/15 bg-white/5 text-indigo-100 hover:border-indigo-300/60 hover:bg-white/10"
                  }`}
                >
                  {tab === "latex" ? "LaTeX" : tab === "pdf" ? "PDF Preview" : "Text"}
                </button>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,1fr)] lg:items-start">
              <div className="space-y-3">
                {outputTab === "latex" && (
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Generated LaTeX will appear here…"
                    className="min-h-[320px] w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-xs text-indigo-50 outline-none transition focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/40"
                  />
                )}
                {outputTab === "text" && (
                  <div className="min-h-[320px] overflow-auto rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-indigo-50">
                    {reply ? latexToText(reply) : "No content yet."}
                  </div>
                )}
                {outputTab === "pdf" && (
                  <div className="min-h-[320px] rounded-2xl border border-white/10 bg-black/20 p-3">
                    {previewError && (
                      <p className="text-sm text-red-200">{previewError}</p>
                    )}
                    {!previewError && (
                      <>
                        {isPreviewLoading && (
                          <p className="text-sm text-indigo-100/70">Building preview…</p>
                        )}
                        {pdfPreviewUrl && (
                          <iframe
                            title="resume-pdf"
                            src={pdfPreviewUrl}
                            className="h-[300px] w-full rounded-xl border border-white/10 bg-white"
                          />
                    )}
                    {!isPreviewLoading && !pdfPreviewUrl && (
                      <p className="text-sm text-indigo-100/70">Resume is generating…</p>
                    )}
                  </>
                )}
              </div>
            )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-indigo-50">Scores</p>
                  {applicationSaveStatus === "saved" && (
                    <span className="text-[11px] text-emerald-200">Job saved!</span>
                  )}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-indigo-200/80">
                      ATS Score
                    </p>
                    <p className="mt-1 text-lg font-semibold text-indigo-50">
                      {atsScore ?? "—"}
                    </p>
                    {atsReason && (
                      <p className="mt-1 text-xs text-indigo-100/70">{atsReason}</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-indigo-200/80">
                      Interview Score
                    </p>
                    <p className="mt-1 text-lg font-semibold text-indigo-50">
                      {interviewScore ?? "—"}
                    </p>
                    {interviewReason && (
                      <p className="mt-1 text-xs text-indigo-100/70">{interviewReason}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {generateCoverLetter && (
              <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-indigo-50">Cover Letter</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={coverLetterFileName}
                      onChange={(e) => setCoverLetterFileName(e.target.value)}
                      className="w-32 rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs text-indigo-50 outline-none focus:border-indigo-400/70 focus:ring-1 focus:ring-indigo-500/40"
                      placeholder="File name"
                    />
                    <button
                      type="button"
                      onClick={handleCopyCover}
                      className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-indigo-100 transition hover:border-indigo-300/60 hover:bg-white/15"
                    >
                      {coverCopyStatus === "copied"
                        ? "Copied"
                        : coverCopyStatus === "failed"
                          ? "Copy failed"
                          : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadCoverLetter}
                      className="rounded-full border border-indigo-300/60 bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-50 transition hover:border-indigo-300/80 hover:bg-indigo-500/30"
                    >
                      Download PDF
                    </button>
                    <button
                      type="button"
                      onClick={handleViewCoverLetter}
                      className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-indigo-100 transition hover:border-indigo-300/60 hover:bg-white/15"
                    >
                      View Cover Letter
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  {(["latex", "pdf"] as const).map((tab) => (
                    <button
                      key={`cover-${tab}`}
                      type="button"
                      onClick={() => setCoverOutputTab(tab)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        coverOutputTab === tab
                          ? "border border-indigo-300/70 bg-indigo-500/20 text-indigo-50"
                          : "border border-white/15 bg-white/5 text-indigo-100 hover:border-indigo-300/60 hover:bg-white/10"
                      }`}
                    >
                      {tab === "latex" ? "LaTeX" : "PDF Preview"}
                    </button>
                  ))}
                </div>
                {coverOutputTab === "latex" && (
                  <textarea
                    value={coverLetterReply}
                    onChange={(e) => setCoverLetterReply(e.target.value)}
                    placeholder="Generated cover letter LaTeX…"
                    className="min-h-[220px] w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-xs text-indigo-50 outline-none transition focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/40"
                  />
                )}
                {coverOutputTab === "pdf" && (
                  <div className="min-h-[220px] rounded-2xl border border-white/10 bg-black/20 p-3">
                    {coverPreviewError && (
                      <p className="text-sm text-red-200">{coverPreviewError}</p>
                    )}
                    {!coverPreviewError && (
                      <>
                        {isCoverPreviewLoading && (
                          <p className="text-sm text-indigo-100/70">Building preview…</p>
                        )}
                        {coverPdfPreviewUrl && (
                          <iframe
                            title="cover-pdf"
                            src={coverPdfPreviewUrl}
                            className="h-[200px] w-full rounded-xl border border-white/10 bg-white"
                          />
                    )}
                    {!isCoverPreviewLoading && !coverPdfPreviewUrl && (
                      <p className="text-sm text-indigo-100/70">Cover letter is generating…</p>
                    )}
                  </>
                )}
              </div>
            )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
    </>
  );
}
