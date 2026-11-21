import assert from "node:assert/strict";
import test from "node:test";

import { minimizePii } from "../src/lib/privacy/minimize";
import { sanitizeLLMMessages } from "../src/lib/ai/sanitize";
import type { LLMMessage } from "../src/lib/ai/types";

test("minimizePii removes common direct identifiers before hosted LLM calls", () => {
  const result = minimizePii(
    "Email me at candidate@example.com or call +1 (555) 123-4567. See https://example.com."
  );

  assert.equal(
    result.text,
    "Email me at [EMAIL] or call [PHONE]. See [URL]."
  );
  assert.equal(result.redactions, 3);
});

test("minimizePii redacts additional identifiers without masking ordinary text", () => {
  const result = minimizePii(
    "SSN 123-45-6789, DOB 01/02/1990, IP 192.168.1.10, IBAN GB82 WEST 1234 5698 7654 32, key sk-1234567890abcdefghijkl. The year 2024 was useful.",
  );

  assert.match(result.text, /\[SSN\]/);
  assert.match(result.text, /\[DATE\]/);
  assert.match(result.text, /\[IP\]/);
  assert.match(result.text, /\[IBAN\]/);
  assert.match(result.text, /\[SECRET\]/);
  assert.match(result.text, /The year 2024 was useful\./);
});

test("resume minimization detects names and contact details in an unlabeled header", () => {
  const resume =
    "JANE DOE | +1 415 555 0198 | jane.doe@example.invalid\n" +
    "Registration No: CAND-2026-1234\n" +
    "Software Engineer with experience from 2021 to 2024.";

  const result = minimizePii(resume, { resume: true });

  assert.equal(
    result.text,
    "[NAME] | [PHONE] | [EMAIL]\nRegistration No: [ID]\n" +
      "Software Engineer with experience from 2021 to 2024.",
  );
  assert.equal(result.redactions, 4);
  assert.deepEqual(
    new Set(result.types),
    new Set(["name", "phone", "email", "personal_id"]),
  );
});

test("resume personal identifiers are masked while similar ordinary labels remain", () => {
  const result = minimizePii(
    "JANE DOE Reg No. 12345; Student ID: STU/2024/0091; Software Engineer",
    { resume: true },
  );

  assert.equal(
    result.text,
    "[NAME] Reg No. [ID]; Student ID: [ID]; Software Engineer",
  );
  assert.equal(result.redactions, 3);
  assert.match(result.text, /^\[NAME\]/);
});

test("resume masking redacts grouped national ID numbers", () => {
  const result = minimizePii("Aadhaar: 1234 5678 9012", { resume: true });

  assert.equal(result.text, "Aadhaar: [ID]");
});

test("sanitizeLLMMessages redacts text and removes images before hosted calls", () => {
  const messages: LLMMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: "Contact candidate@example.com." },
        { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
      ],
    },
  ];

  const sanitized = sanitizeLLMMessages(messages);
  assert.deepEqual(sanitized[0].content, [
    { type: "text", text: "Contact [EMAIL]." },
    { type: "text", text: "[Image omitted by the privacy policy.]" },
  ]);
});