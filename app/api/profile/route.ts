import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

const PROFILE_ID = 1;

export async function GET() {
  try {
    const profile = await prisma.profile.findUnique({
      where: { id: PROFILE_ID },
    });
    if (!profile) {
      return NextResponse.json(
        {
          resumeTemplate: null,
          coverLetterTemplate: null,
          instructions: null,
          coverLetterInstructions: null,
          resumeFileName: null,
          coverLetterFileName: null,
          currentPlatform: null,
        },
        { status: 200 },
      );
    }
    return NextResponse.json(profile);
  } catch (err) {
    console.error("Failed to load profile", err);
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const saved = await prisma.profile.upsert({
      where: { id: PROFILE_ID },
      update: {
        resumeTemplate: body.resumeTemplate ?? "",
        coverLetterTemplate: body.coverLetterTemplate ?? "",
        instructions: body.instructions ?? "",
        coverLetterInstructions: body.coverLetterInstructions ?? "",
        resumeFileName: body.resumeFileName ?? "",
        coverLetterFileName: body.coverLetterFileName ?? "",
        currentPlatform: body.currentPlatform ?? null,
      },
      create: {
        id: PROFILE_ID,
        resumeTemplate: body.resumeTemplate ?? "",
        coverLetterTemplate: body.coverLetterTemplate ?? "",
        instructions: body.instructions ?? "",
        coverLetterInstructions: body.coverLetterInstructions ?? "",
        resumeFileName: body.resumeFileName ?? "",
        coverLetterFileName: body.coverLetterFileName ?? "",
        currentPlatform: body.currentPlatform ?? null,
      },
    });
    return NextResponse.json(saved);
  } catch (err) {
    console.error("Failed to save profile", err);
    return NextResponse.json({ error: "Failed to save profile." }, { status: 500 });
  }
}
