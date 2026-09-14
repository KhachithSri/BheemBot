import assert from "node:assert/strict";
import test from "node:test";

import { minimizePii } from "../src/lib/privacy/minimize";

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