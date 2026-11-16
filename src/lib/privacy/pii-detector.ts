export type PIIType =
  | "email"
  | "phone"
  | "ssn"
  | "credit_card"
  | "name"
  | "address"
  | "dob"
  | "url"
  | "ip_address"
  | "iban"
  | "credential";

export interface PIIEntity {
  type: PIIType;
  value: string;
  start: number;
  end: number;
  confidence: number;
}

const PATTERNS: Partial<Record<PIIType, RegExp>> = {
  email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  phone: /(?<!\w)\+?(?:\(?\d\)?[ \t().-]*){6,14}\d(?:\s*(?:x|ext\.?)\s*\d{1,6})?(?!\w)/gi,
  ssn: /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g,
  credit_card: /\b(?:\d[ -]*?){13,19}\b/g,
  address:
    /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,5}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Terrace|Ter|Place|Pl)\.?(?:\s*,?\s*(?:[A-Za-z .'-]+,\s*)?[A-Z]{2}\s+\d{5}(?:-\d{4})?)?/gi,
  dob: /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b|\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b|\b(?:0?[1-9]|[12]\d|3[01])\.(?:0?[1-9]|1[0-2])\.(?:19|20)\d{2}\b/g,
  url: /(?:https?:\/\/|www\.)[^\s<>"']*[^\s<>"'.,!?;:]/gi,
  ip_address:
    /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g,
  iban: /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){11,30}\b/gi,
  credential:
    /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g,
};

const TYPE_PRIORITY: Record<PIIType, number> = {
  credential: 0,
  email: 1,
  url: 2,
  credit_card: 3,
  iban: 4,
  ssn: 5,
  dob: 6,
  ip_address: 7,
  address: 8,
  phone: 9,
  name: 10,
};

function confidenceFor(type: PIIType, value: string): number {
  if (type === "credit_card") {
    return value.replace(/\D/g, "").length >= 13 ? 0.8 : 0.4;
  }
  if (type === "phone") {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15 ? 0.85 : 0.4;
  }
  if (type === "iban") return 0.85;
  if (type === "name") return 0.7;
  return 0.95;
}

function selectNonOverlapping(entities: PIIEntity[]): PIIEntity[] {
  const sorted = [...entities].sort(
    (a, b) =>
      a.start - b.start ||
      TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type] ||
      b.end - a.end,
  );
  const selected: PIIEntity[] = [];
  let end = -1;

  for (const entity of sorted) {
    if (entity.start < end) continue;
    selected.push(entity);
    end = entity.end;
  }

  return selected;
}

export class PIIDetector {
  detectPII(text: string): PIIEntity[] {
    const entities: PIIEntity[] = [];

    for (const [type, pattern] of Object.entries(PATTERNS) as [
      PIIType,
      RegExp,
    ][]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          type,
          value: match[0],
          start: match.index,
          end: match.index + match[0].length,
          confidence: confidenceFor(type, match[0]),
        });
        if (match[0].length === 0) pattern.lastIndex++;
      }
    }

    const namePattern =
      /\b(?:my name is|i am|i'm|this is|candidate(?: name)?\s*[:=])\s+([A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?(?:\s+[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?){0,2})/gi;
    namePattern.lastIndex = 0;
    let nameMatch: RegExpExecArray | null;
    while ((nameMatch = namePattern.exec(text)) !== null) {
      const name = nameMatch[1]?.trim();
      if (!name) continue;
      const nameOffset = nameMatch[0].lastIndexOf(name);
      entities.push({
        type: "name",
        value: name,
        start: nameMatch.index + nameOffset,
        end: nameMatch.index + nameOffset + name.length,
        confidence: confidenceFor("name", name),
      });
    }

    return selectNonOverlapping(entities);
  }

  maskPII(text: string, maskChar = "[REDACTED]"): string {
    const entities = this.detectPII(text);
    let maskedText = text;

    for (const entity of [...entities].reverse()) {
      if (entity.confidence >= 0.7) {
        maskedText =
          maskedText.slice(0, entity.start) +
          maskChar +
          maskedText.slice(entity.end);
      }
    }

    return maskedText;
  }
}
