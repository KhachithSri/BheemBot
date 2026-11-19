import { createLogger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { candidateInviteHash } from "@/lib/privacy/candidate-encryption";
import { tailorInterviewQuestions } from "@/lib/ai/tailor-interview-questions";
import { supabaseAdmin } from "@/lib/supabase/admin";

const log = createLogger("api/interviews/tailor-questions");
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_RESUME_TEXT_LENGTH = 15_000;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
) => Promise<{ text: string }>;

export async function POST(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const clientIp = req.headers.get("x-real-ip") ?? forwardedFor?.split(",")[0]?.trim() ?? "unknown";
  const rateLimitResponse = checkRateLimit(`tailor-questions:${clientIp}`, {
    windowMs: 10 * 60_000,
    maxRequests: 5,
  });
  if (rateLimitResponse) return rateLimitResponse;
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE + 32_000) {
    return Response.json(
      { error: "Resume must be a PDF no larger than 5 MB." },
      { status: 413 },
    );
  }

  try {
    const formData = await req.formData();
    const interviewSlug = formData.get("interviewSlug");
    const inviteToken = formData.get("inviteToken");
    const file = formData.get("file");

    if (typeof interviewSlug !== "string" || !interviewSlug.trim()) {
      return Response.json({ error: "Interview link is invalid." }, { status: 400 });
    }
    if (inviteToken !== null && typeof inviteToken !== "string") {
      return Response.json({ error: "Invite link is invalid." }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "Choose a PDF resume to upload." }, { status: 400 });
    }
    if (
      file.size > MAX_FILE_SIZE ||
      (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))
    ) {
      return Response.json(
        { error: "Resume must be a PDF no larger than 5 MB." },
        { status: 400 },
      );
    }
    const { data: interview, error: interviewError } = await supabaseAdmin
      .from("interviews")
      .select("id, publicSlug, title, description, objective, language, aiTone, followUpDepth, llmProvider, llmModel, requireInvite, isActive, questions(*)")
      .eq("publicSlug", interviewSlug)
      .eq("isActive", true)
      .order("order", { referencedTable: "questions", ascending: true })
      .single();

    if (interviewError || !interview) {
      return Response.json({ error: "Interview not found or inactive." }, { status: 404 });
    }

    if (interview.requireInvite || inviteToken) {
      if (typeof inviteToken !== "string" || !inviteToken) {
        return Response.json({ error: "A personal invite link is required." }, { status: 403 });
      }

      const { data: hashedCandidate } = await supabaseAdmin
        .from("candidates")
        .select("interviewId")
        .eq("inviteTokenHash", candidateInviteHash(inviteToken))
        .maybeSingle();
      const { data: legacyCandidate } = hashedCandidate
        ? { data: null }
        : await supabaseAdmin
            .from("candidates")
            .select("interviewId")
            .eq("inviteToken", inviteToken)
            .maybeSingle();
      const candidate = hashedCandidate ?? legacyCandidate;

      if (!candidate || candidate.interviewId !== interview.id) {
        return Response.json({ error: "Invite link is invalid for this interview." }, { status: 403 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return Response.json({ error: "The uploaded file is not a valid PDF." }, { status: 400 });
    }
    let parsedPdf: { text: string };
    try {
      parsedPdf = await pdfParse(buffer);
    } catch {
      return Response.json(
        { error: "Could not read this PDF. Please upload a valid resume PDF." },
        { status: 400 },
      );
    }
    const resumeText = parsedPdf.text?.trim().slice(0, MAX_RESUME_TEXT_LENGTH) ?? "";
    if (!resumeText) {
      return Response.json(
        { error: "Could not extract readable text from this PDF." },
        { status: 400 },
      );
    }

    const questions = await tailorInterviewQuestions(
      {
        ...interview,
        questions: interview.questions ?? [],
      },
      resumeText,
    );

    return Response.json({ questions });
  } catch (error) {
    log.error("Candidate resume question tailoring failed:", error);
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 429
    ) {
      return Response.json(
        { error: "AI question tailoring is temporarily rate-limited. Please try again shortly or continue without a resume." },
        { status: 429 },
      );
    }
    const message = error instanceof Error ? error.message : "";
    if (/No LLM provider configured/i.test(message)) {
      return Response.json(
        { error: "AI question tailoring is currently unavailable." },
        { status: 503 },
      );
    }
    return Response.json(
      { error: "Could not tailor interview questions. Please try again or continue without a resume." },
      { status: 500 },
    );
  }
}
