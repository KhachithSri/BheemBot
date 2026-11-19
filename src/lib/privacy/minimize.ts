import { PIIDetector, type PIIType } from "./pii-detector";

export interface PrivacyResult {
  text: string;
  redactions: number;
  types: PIIType[];
}

const REPLACEMENTS: Record<PIIType, string> = {
  email: "[EMAIL]",
  phone: "[PHONE]",
  ssn: "[SSN]",
  credit_card: "[NUMBER]",
  name: "[NAME]",
  address: "[ADDRESS]",
  dob: "[DATE]",
  url: "[URL]",
  ip_address: "[IP]",
  iban: "[IBAN]",
  credential: "[SECRET]",
};

const detector = new PIIDetector();

/** Remove supported direct identifiers before text reaches a hosted model. */
export function minimizePii(input: string): PrivacyResult {
  const entities = detector.detectPII(input).filter(
    (entity) => entity.confidence >= 0.7,
  );
  let text = input;

  for (const entity of [...entities].reverse()) {
    text =
      text.slice(0, entity.start) +
      REPLACEMENTS[entity.type] +
      text.slice(entity.end);
  }

  return {
    text,
    redactions: entities.length,
    types: Array.from(new Set(entities.map((entity) => entity.type))),
  };
}
