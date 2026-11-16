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