import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  try {
    const apps = await prisma.application.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(apps);
  } catch (err) {
    console.error("Failed to load applications", err);
    return NextResponse.json({ error: "Failed to load applications." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const created = await prisma.application.create({
      data: {
        company: body.company,
        status: body.status ?? "Applied",
        platform: body.platform ?? null,
        resumeLatex: body.resumeLatex ?? "",
        coverLetter: body.coverLetter ?? null,
        jobDescription: body.jobDescription ?? null,
        atsScore: body.atsScore ?? null,
        interviewScore: body.interviewScore ?? null,
        createdAt: body.createdAt ? new Date(body.createdAt) : undefined,
      },
    });
    return NextResponse.json(created);
  } catch (err) {
    console.error("Failed to create application", err);
    return NextResponse.json({ error: "Failed to create application." }, { status: 500 });
  }
}
