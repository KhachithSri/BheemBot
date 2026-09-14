const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g;
const CARD_PATTERN = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g;
const URL_PATTERN = /\bhttps?:\/\/[^\s]+/gi;

export interface PrivacyResult {
  text: string;
  redactions: number;
}

/** Remove common direct identifiers before text is sent to a hosted LLM. */
export function minimizePii(input: string): PrivacyResult {
  let text = input;
  let redactions = 0;

  for (const [pattern, replacement] of [
    [EMAIL_PATTERN, "[EMAIL]"],
    [PHONE_PATTERN, "[PHONE]"],
    [CARD_PATTERN, "[NUMBER]"],
  ] as const) {
    text = text.replace(pattern, () => {
      redactions += 1;
      return replacement;
    });
  }

  text = text.replace(URL_PATTERN, (match) => {
    redactions += 1;
    const punctuation = match.match(/[.,!?;:]+$/)?.[0] || "";
    return `[URL]${punctuation}`;
  });

  return { text, redactions };
}
