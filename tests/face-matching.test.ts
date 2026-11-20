import assert from "node:assert/strict";
import test from "node:test";

import {
  compareCaptureFaces,
  cosineSimilarity,
  getSFaceAlignmentTransform,
} from "@/lib/privacy/face-matching";

test("face comparison establishes a reference from the first detected face", () => {
  const first = new Float32Array([1, 0, 0]);
  const second = new Float32Array([0.99, 0.1, 0]);

  const result = compareCaptureFaces(null, [first, second]);

  assert.equal(result.status, "similar");
  assert.equal(result.reference, first);
});

test("face comparison marks any non-matching detected face as changed", () => {
  const reference = new Float32Array([1, 0, 0]);
  const similar = new Float32Array([0.99, 0.1, 0]);
  const different = new Float32Array([0, 1, 0]);

  assert.equal(
    compareCaptureFaces(reference, [similar, different]).status,
    "changed",
  );
  assert.equal(compareCaptureFaces(reference, []).status, "changed");
});

test("cosine similarity rejects invalid embeddings", () => {
  assert.equal(cosineSimilarity(new Float32Array([0, 0]), new Float32Array([0, 0])), null);
  assert.equal(cosineSimilarity(new Float32Array([1]), new Float32Array([1, 0])), null);
  assert.equal(
    cosineSimilarity(new Float32Array([Number.NaN]), new Float32Array([1])),
    null,
  );
});

test("SFace alignment maps its five-point template to the 112px reference template", () => {
  const points = [
    { x: 38.2946, y: 51.6963 },
    { x: 73.5318, y: 51.5014 },
    { x: 56.0252, y: 71.7366 },
    { x: 41.5493, y: 92.3655 },
    { x: 70.7299, y: 92.2041 },
  ];

  const transform = getSFaceAlignmentTransform(points);

  assert.ok(transform);
  assert.ok(Math.abs(transform.a - 1) < 1e-5);
  assert.ok(Math.abs(transform.d - 1) < 1e-5);
  assert.ok(Math.abs(transform.b) < 1e-5);
  assert.ok(Math.abs(transform.e) < 1e-3);
  assert.ok(Math.abs(transform.f) < 1e-3);
});
