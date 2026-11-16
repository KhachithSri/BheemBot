import { buildInterviewerPrompt } from "@/lib/ai/prompts/interviewer";
import { getProvider } from "@/lib/ai/registry";
import { createLogger } from "@/lib/logger";
import { minimizePii } from "@/lib/privacy/minimize";
import { recordPrivacyEvents } from "@/lib/privacy/privacy-events";
import type { LLMMessage } from "@/lib/ai/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const log = createLogger("api/ai/chat");

export async function POST(req: Request) {
  const { sessionId, interviewId, messages, currentQuestionIndex } =
    await req.json();

  try {
    if (typeof sessionId !== "string" || !sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .select("status, contentPurgedAt")
      .eq("id", sessionId)
      .single();
    if (sessionError) {
      throw new Error(`Could not load session: ${sessionError.message}`);
    }
    if (session.contentPurgedAt) {
      return NextResponse.json(
        { error: "Session content is no longer available" },
        { status: 410 },
      );
    }
    if (session.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { error: "Session is no longer active" },
        { status: 400 },
      );
    }

    const { data: interview } = await supabaseAdmin
      .from("interviews")
      .select("*, questions(*)")
      .eq("id", interviewId)
      .order("order", { referencedTable: "questions", ascending: true })
      .single();

    if (!interview) {
      return NextResponse.json(
        { error: "Interview not found" },
        { status: 404 },
      );
    }

    const provider = getProvider(interview.llmProvider);

    const conversationHistory: LLMMessage[] = messages.map(
      (m: { role: "user" | "assistant"; content: string }) => ({
        role: m.role,
        content: minimizePii(m.content).text,
      }),
    );

    await recordPrivacyEvents(
      messages.map((m: { content: string }) => ({ sessionId, content: m.content })),
    );

    const promptMessages = buildInterviewerPrompt({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      interview: interview as any,
      conversationHistory,
      currentQuestionIndex: currentQuestionIndex ?? 0,
    });

    const response = await provider.generateResponse({
      messages: promptMessages,
      temperature: 0.7,
      maxTokens: 1024,
      model: interview.llmModel ?? undefined,
    });

    const safeResponse = minimizePii(response.content).text;
    const isComplete = safeResponse.includes("[INTERVIEW_COMPLETE]");
    const questionAdvanced = safeResponse.includes("[NEXT_QUESTION]");

    const cleanContent = safeResponse
      .replace("[INTERVIEW_COMPLETE]", "")
      .replace("[NEXT_QUESTION]", "")
      .trim();

    const { error: saveError } = await supabaseAdmin.from("messages").insert({
      sessionId,
      role: "ASSISTANT" as const,
      content: cleanContent,
      wordCount: cleanContent.split(/\s+/).length,
    });
    if (saveError) {
      throw new Error(`Could not save assistant message: ${saveError.message}`);
    }

    if (questionAdvanced) {
      const nextIndex = (currentQuestionIndex ?? 0) + 1;
      const questions = (interview.questions ?? []) as { id: string }[];
      const nextQuestion = questions[nextIndex];
      if (nextQuestion) {
        await supabaseAdmin
          .from("sessions")
          .update({ currentQuestionId: nextQuestion.id })
          .eq("id", sessionId);
      }
    }

    return NextResponse.json({
      content: cleanContent,
      questionAdvanced,
      isComplete,
    });
  } catch (error) {
    log.error("Chat AI error:", error);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 },
    );
  }
}
