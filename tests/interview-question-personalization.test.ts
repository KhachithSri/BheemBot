import assert from "node:assert/strict";
import test from "node:test";

import { applyQuestionPersonalization } from "../src/lib/interview-question-personalization";

test("applies candidate-specific wording without changing question structure", () => {
  const questions = [
    { id: "q1", order: 0, text: "Original question", type: "OPEN_ENDED", options: null },
    { id: "q2", order: 1, text: "Choice question", type: "SINGLE_CHOICE", options: ["A", "B"] },
  ];

  const result = applyQuestionPersonalization(questions, [
    { id: "q2", text: "Personalized choice question", description: null },
    { id: "q1", text: "Personalized question", description: "Focus area" },
  ]);

  assert.deepEqual(result, [
    {
      ...questions[0],
      text: "Personalized question",
      description: "Focus area",
    },
    {
      ...questions[1],
      text: "Personalized choice question",
      description: null,
    },
  ]);
});

test("keeps the recruiter script intact when personalizations do not match", () => {
  const questions = [
    { id: "q1", order: 0, text: "Original question", type: "OPEN_ENDED" },
    { id: "q2", order: 1, text: "Second question", type: "OPEN_ENDED" },
  ];

  assert.equal(
    applyQuestionPersonalization(questions, [
      { id: "q1", text: "Changed", description: null },
    ]),
    questions,
  );
  assert.equal(
    applyQuestionPersonalization(questions, [
      { id: "q1", text: "Changed", description: null },
      { id: "q1", text: "Duplicate", description: null },
    ]),
    questions,
  );
});
