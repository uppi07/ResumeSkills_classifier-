-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('Applied', 'Shortlisted', 'Interviewing');

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'Applied',
    "platform" TEXT,
    "resumeLatex" TEXT NOT NULL,
    "coverLetter" TEXT,
    "jobDescription" TEXT,
    "atsScore" INTEGER,
    "interviewScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "resumeTemplate" TEXT NOT NULL,
    "coverLetterTemplate" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "coverLetterInstructions" TEXT NOT NULL,
    "resumeFileName" TEXT NOT NULL,
    "coverLetterFileName" TEXT NOT NULL,
    "currentPlatform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);
