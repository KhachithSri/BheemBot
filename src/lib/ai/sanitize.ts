import { minimizePii } from "@/lib/privacy/minimize";
import type { LLMContentPart, LLMMessage } from "./types";

export function sanitizeLLMMessages(messages: LLMMessage[]): LLMMessage[] {
  return messages.map((message) => {
    if (typeof message.content === "string") {
      return { ...message, content: minimizePii(message.content).text };
    }

    let removedImage = false;
    const content: LLMContentPart[] = [];
    for (const part of message.content) {
      if (part.type === "image_url") {
        removedImage = true;
      } else {
        content.push({ ...part, text: minimizePii(part.text).text });
      }
    }

    if (removedImage) {
      content.push({
        type: "text",
        text: "[Image omitted by the privacy policy.]",
      });
    }

    return { ...message, content };
  });
}
