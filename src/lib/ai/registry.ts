import { type LLMProvider } from "./types";
import { GroqProvider } from "./providers/groq";
import { XAIProvider } from "./providers/xai";

// Groq retired the Llama 3.3 aliases used by earlier versions of the app.
// Keep this overridable because the models enabled for a Groq account can vary.
const GROQ_GENERATOR_MODEL = process.env.GROQ_GENERATOR_MODEL ?? "qwen/qwen3.8-27b";
const GROQ_REPORT_MODEL = process.env.GROQ_REPORT_MODEL ?? GROQ_GENERATOR_MODEL;

const providers = new Map<string, LLMProvider>();

function registerProvider(provider: LLMProvider) {
  providers.set(provider.id, provider);
}

registerProvider(new GroqProvider());
registerProvider(new XAIProvider());

const XAI_GENERATOR_MODEL = process.env.XAI_GENERATOR_MODEL ?? "grok-3-mini";
const XAI_REPORT_MODEL = process.env.XAI_REPORT_MODEL ?? XAI_GENERATOR_MODEL;

/** Resolve the right provider for a given model name or provider id. */
export function getProvider(idOrModel?: string | null): LLMProvider {
  if (idOrModel) {
    if (providers.has(idOrModel)) return providers.get(idOrModel)!;
    const allProviders = Array.from(providers.values());
    for (const p of allProviders) {
      if (p.models.some((m: string) => m.toLowerCase() === idOrModel.toLowerCase())) {
        return p;
      }
    }
  }
  // Default fallback order: groq → xAI
  if (process.env.GROQ_API_KEY) return providers.get("groq")!;
  if (process.env.XAI_API_KEY) return providers.get("xai")!;
  throw new Error("No LLM provider configured. Set GROQ_API_KEY or XAI_API_KEY.");
}

export function listProviders(): LLMProvider[] {
  return Array.from(providers.values());
}

/**
 * Model used for post-interview report generation.
 * Falls back through available providers.
 */
export const REPORT_MODEL =
  process.env.REPORT_MODEL ??
  (process.env.GROQ_API_KEY
    ? GROQ_REPORT_MODEL
    : process.env.XAI_API_KEY
      ? XAI_REPORT_MODEL
      : GROQ_REPORT_MODEL);

/**
 * Model used for interview question generation and refinement.
 */
export const GENERATOR_MODEL = process.env.GROQ_API_KEY
  ? GROQ_GENERATOR_MODEL
  : process.env.XAI_API_KEY
    ? XAI_GENERATOR_MODEL
    : GROQ_GENERATOR_MODEL;
