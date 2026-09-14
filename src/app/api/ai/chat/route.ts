import { buildInterviewerPrompt } from "@/lib/ai/prompts/interviewer";
import { getProvider } from "@/lib/ai/registry";
import { createLogger } from "@/lib/logger";
import { PIIDetector } from "@/lib/privacy/pii-detector";
import type { LLMMessage } from "@/lib/ai/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const log = createLogger("api/ai/chat");

export async function POST(req: Request) {
  const { sessionId, interviewId, messages, currentQuestionIndex } =
    await req.json();

  try {
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

    const piiDetector = new PIIDetector();
    
    const conversationHistory: LLMMessage[] = messages.map(
      (m: { role: "user" | "assistant"; content: string }) => {
        const detectedPII = piiDetector.detectPII(m.content);
        const filteredContent = detectedPII.length > 0 
          ? piiDetector.maskPII(m.content)
          : m.content;
        
        if (detectedPII.length > 0) {
          void supabaseAdmin.from("privacy_events").insert({
            session_id: sessionId,
            pii_types: detectedPII.map(e => e.type),
            pii_count: detectedPII.length,
            original_content: m.content,
            masked_content: filteredContent,
            confidence_threshold: 0.7
          });
          log.info(`PII detected and masked in message: ${detectedPII.length} entities`);
        }
        
        return {
          role: m.role as "user" | "assistant",
          content: filteredContent,
        };
      },
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

    const isComplete = response.content.includes("[INTERVIEW_COMPLETE]");
    const questionAdvanced = response.content.includes("[NEXT_QUESTION]");

    const cleanContent = response.content
      .replace("[INTERVIEW_COMPLETE]", "")
      .replace("[NEXT_QUESTION]", "")
      .trim();

    await supabaseAdmin.from("messages").insert({
      sessionId,
      role: "ASSISTANT" as const,
      content: cleanContent,
      wordCount: cleanContent.split(/\s+/).length,
    });

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
