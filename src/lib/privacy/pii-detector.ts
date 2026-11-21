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
  | "credential"
  | "personal_id";

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

const PERSONAL_ID_PATTERN =
  /\b(?:registration(?:\s*(?:id|no\.?|number))?|register(?:\s*(?:id|no\.?|number))?|reg\.?(?:\s*(?:id|no\.?|number))?|roll(?:\s*(?:id|no\.?|number))?|enrol(?:l)?ment(?:\s*(?:id|no\.?|number))?|student\s*(?:id|no\.?|number)|candidate\s*(?:id|no\.?|number)|application\s*(?:id|no\.?|number)|employee\s*(?:id|no\.?|number)|admission\s*(?:id|no\.?|number)|university\s*(?:id|no\.?|number)|passport(?:\s*(?:no\.?|number))?|aadhaar|aadhar|pan)\s*[:=#-]?\s*(\d{4}(?:[ \t-]\d{4}){2}|[A-Z0-9][A-Z0-9/-]{2,})\b/gi;

const TYPE_PRIORITY: Record<PIIType, number> = {
  credential: 0,
  email: 1,
  url: 2,
  personal_id: 3,
  credit_card: 4,
  iban: 5,
  ssn: 6,
  dob: 7,
  ip_address: 8,
  address: 9,
  phone: 10,
  name: 11,
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
  if (type === "personal_id") return 0.95;
  return 0.95;
}

const RESUME_HEADER_EXCLUSIONS = new Set([
  "analyst",
  "business",
  "candidate",
  "contact",
  "curriculum",
  "developer",
  "director",
  "education",
  "engineer",
  "experience",
  "intern",
  "manager",
  "objective",
  "professional",
  "profile",
  "registration",
  "resume",
  "roll",
  "senior",
  "software",
  "specialist",
  "student",
  "summary",
  "no",
]);

function isResumeHeaderName(value: string): boolean {
  const tokens = value.trim().split(/\s+/);
  if (tokens.length < 2 || tokens.length > 4) return false;
  if (
    !tokens.every((token) => /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'’-]*\.?$/.test(token))
  ) {
    return false;
  }
  if (
    tokens.some((token) =>
      RESUME_HEADER_EXCLUSIONS.has(token.replace(/\.$/, "").toLowerCase()),
    )
  ) {
    return false;
  }
  return tokens.every(
    (token) => token[0] === token[0]?.toLocaleUpperCase(),
  );
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

    PERSONAL_ID_PATTERN.lastIndex = 0;
    let idMatch: RegExpExecArray | null;
    while ((idMatch = PERSONAL_ID_PATTERN.exec(text)) !== null) {
      const value = idMatch[1];
      if (!value) continue;
      const valueOffset = idMatch[0].lastIndexOf(value);
      entities.push({
        type: "personal_id",
        value,
        start: idMatch.index + valueOffset,
        end: idMatch.index + valueOffset + value.length,
        confidence: confidenceFor("personal_id", value),
      });
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

  detectResumePII(text: string): PIIEntity[] {
    const entities = this.detectPII(text);
    const lines: RegExpExecArray[] = [];
    const linePattern = /[^\r\n]+/g;
    let line: RegExpExecArray | null;
    while ((line = linePattern.exec(text)) !== null && lines.length < 8) {
      if (line[0].trim()) lines.push(line);
    }

    for (const line of lines) {
      const sanitized = line[0].split("");
      for (const entity of entities) {
        const start = Math.max(entity.start, line.index ?? 0);
        const end = Math.min(entity.end, (line.index ?? 0) + line[0].length);
        for (let index = start; index < end; index++) {
          sanitized[index - (line.index ?? 0)] = " ";
        }
      }

      PERSONAL_ID_PATTERN.lastIndex = 0;
      let idMatch: RegExpExecArray | null;
      while ((idMatch = PERSONAL_ID_PATTERN.exec(text)) !== null) {
        const start = Math.max(idMatch.index, line.index ?? 0);
        const end = Math.min(
          idMatch.index + idMatch[0].length,
          (line.index ?? 0) + line[0].length,
        );
        for (let index = start; index < end; index++) {
          sanitized[index - (line.index ?? 0)] = " ";
        }
      }

      const sanitizedLine = sanitized.join("");
      const segments = sanitizedLine.split(
        /\s+(?:\||•|·|,|;|[-–—])\s+|[|•·,;]+/,
      );
      let segmentOffset = 0;
      for (const segment of segments) {
        const foundAt = sanitizedLine.indexOf(segment, segmentOffset);
        if (foundAt < 0) continue;
        const trimmed = segment.trim();
        const leadingWhitespace = segment.length - segment.trimStart().length;
        const start = foundAt + leadingWhitespace;
        if (isResumeHeaderName(trimmed)) {
          const absoluteStart = (line.index ?? 0) + start;
          const alreadyDetected = entities.some(
            (entity) =>
              entity.type === "name" &&
              entity.start === absoluteStart &&
              entity.end === absoluteStart + trimmed.length,
          );
          if (!alreadyDetected) {
            entities.push({
              type: "name",
              value: trimmed,
              start: absoluteStart,
              end: absoluteStart + trimmed.length,
              confidence: confidenceFor("name", trimmed),
            });
          }
          return selectNonOverlapping(entities);
        }
        segmentOffset = foundAt + segment.length;
      }
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
