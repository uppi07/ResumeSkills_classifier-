import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const body = await request.json();
    const updated = await prisma.application.update({
      where: { id },
      data: {
        status: body.status,
        platform: body.platform,
        resumeLatex: body.resumeLatex,
        coverLetter: body.coverLetter,
        jobDescription: body.jobDescription,
        atsScore: body.atsScore,
        interviewScore: body.interviewScore,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("Failed to update application", err);
    return NextResponse.json({ error: "Failed to update application." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.application.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete application", err);
    return NextResponse.json({ error: "Failed to delete application." }, { status: 500 });
  }
}
