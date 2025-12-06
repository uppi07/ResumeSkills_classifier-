import { NextResponse } from "next/server";

type Insights = {
  skillsText: string;
  skillsChars: number;
  salary: string;
  clearance: "yes" | "no" | "not mentioned";
  h1b: "yes" | "no" | "not specified";
};

function extractSkills(text: string) {
  const sections = ["skills", "requirements", "qualifications"];
  for (const sec of sections) {
    const regex = new RegExp(`${sec}[\\s\\S]*?(?=\\n[A-Z][^\\n]*:|$)`, "i");
    const match = text.match(regex);
    if (match) {
      return match[0].trim();
    }
  }
  return "";
}

function extractSalary(text: string) {
  const salaryRegex = /\$[\d,]+(?:\s*[-–]\s*\$?[\d,]+)?/g;
  const matches = text.match(salaryRegex);
  return matches && matches.length ? matches.join(" / ") : "not mentioned";
}

function extractClearance(text: string): Insights["clearance"] {
  const lower = text.toLowerCase();
  if (lower.includes("clearance") || lower.includes("ts/sci") || lower.includes("secret")) {
    return "yes";
  }
  return "not mentioned";
}

function extractH1B(text: string): Insights["h1b"] {
  const lower = text.toLowerCase();
  if (lower.includes("h1b") || lower.includes("h-1b") || lower.includes("visa sponsorship")) {
    if (lower.includes("no sponsor") || lower.includes("no sponsorship")) {
      return "no";
    }
    return "yes";
  }
  if (
    lower.includes("work authorization") &&
    (lower.includes("no sponsorship") || lower.includes("cannot sponsor"))
  ) {
    return "no";
  }
  return "not specified";
}

export async function POST(request: Request) {
  let jobDescription = "";
  try {
    const body = await request.json();
    jobDescription = body?.jobDescription?.toString() || "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!jobDescription) {
    return NextResponse.json(
      { error: "Please provide a job description." },
      { status: 400 },
    );
  }

  const skillsText = extractSkills(jobDescription);
  const skillsChars = skillsText.length;
  const salary = extractSalary(jobDescription);
  const clearance = extractClearance(jobDescription);
  const h1b = extractH1B(jobDescription);

  const insights: Insights = {
    skillsText,
    skillsChars,
    salary,
    clearance,
    h1b,
  };

  return NextResponse.json(insights);
}
