import { NextResponse } from "next/server";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { spawn } from "child_process";
import os from "os";
import path from "path";

async function compileWithTectonic(texPath: string, outDir: string) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn("tectonic", ["--outdir", outDir, texPath], {
      cwd: outDir,
    });

    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (error) => {
      const err = error as Error & { stderr?: string };
      err.stderr = stderr;
      reject(err);
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const err = new Error(`Tectonic exited with code ${code}`) as Error & {
          stderr?: string;
          code?: number;
        };
        err.stderr = stderr;
        err.code = code ?? undefined;
        reject(err);
      }
    });
  });
}

function sanitizeFilename(raw?: string) {
  if (!raw) return "resume";
  const trimmed = raw.replace(/\.pdf$/i, "").trim();
  if (!trimmed) return "resume";
  // Strip non-ASCII, collapse invalid characters.
  const ascii = trimmed
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || "resume";
}

export async function POST(request: Request) {
  let latex: string | undefined;
  let filename: string | undefined;
  try {
    const body = await request.json();
    latex = typeof body?.latex === "string" ? body.latex : undefined;
    filename = typeof body?.filename === "string" ? body.filename : undefined;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 },
    );
  }

  if (!latex) {
    return NextResponse.json(
      { error: "Missing LaTeX content to compile." },
      { status: 400 },
    );
  }

  const baseName = sanitizeFilename(filename);
  const safeName = `${baseName}.pdf`;

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "latex-compile-"));
  const texPath = path.join(tempDir, "resume.tex");
  const pdfPath = path.join(tempDir, "resume.pdf");

  try {
    await writeFile(texPath, latex, "utf8");
    await compileWithTectonic(texPath, tempDir);
    const pdfBuffer = await readFile(pdfPath);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to compile LaTeX:", error);
    const message =
      error instanceof Error ? error.message : "Failed to compile LaTeX.";
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? (error as { stderr?: string }).stderr
        : undefined;
    const snippet =
      stderr && stderr.length > 1600 ? `${stderr.slice(0, 1600)}…` : stderr;
    return NextResponse.json(
      {
        error: "PDF compilation failed.",
        details: message,
        log: snippet,
      },
      { status: 500 },
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
