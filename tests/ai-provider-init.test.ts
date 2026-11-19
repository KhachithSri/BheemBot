import assert from "node:assert/strict";
import test from "node:test";

import { GroqProvider } from "@/lib/ai/providers/groq";
import { XAIProvider } from "@/lib/ai/providers/xai";

test("AI providers can be imported and constructed without API keys", () => {
  const groqApiKey = process.env.GROQ_API_KEY;
  const xaiApiKey = process.env.XAI_API_KEY;

  try {
    process.env.GROQ_API_KEY = "";
    process.env.XAI_API_KEY = "";

    assert.doesNotThrow(() => new GroqProvider());
    assert.doesNotThrow(() => new XAIProvider());
  } finally {
    if (groqApiKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groqApiKey;
    if (xaiApiKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = xaiApiKey;
  }
});
