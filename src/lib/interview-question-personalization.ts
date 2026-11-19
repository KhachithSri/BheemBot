import type { CandidateQuestionPersonalization } from "@/lib/ai/types";

export function applyQuestionPersonalization<
  T extends { id: string; text: string; description?: string | null },
>(
  questions: T[],
  personalization: unknown,
): T[] {
  if (!Array.isArray(personalization) || personalization.length !== questions.length) {
    return questions;
  }

  const updates = new Map<string, CandidateQuestionPersonalization>();
  for (const item of personalization) {
    if (
      !item ||
      typeof item.id !== "string" ||
      typeof item.text !== "string" ||
      (item.description !== null && typeof item.description !== "string") ||
      updates.has(item.id)
    ) {
      return questions;
    }
    updates.set(item.id, item as CandidateQuestionPersonalization);
  }

  if (questions.some((question) => !updates.has(question.id))) {
    return questions;
  }

  return questions.map((question) => {
    const update = updates.get(question.id)!;
    return {
      ...question,
      text: update.text,
      description: update.description,
    };
  });
}
