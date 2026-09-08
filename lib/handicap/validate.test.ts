import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSubmitInput } from "./validate.ts";
import type { HandicapHoleInput, SubmitHandicapRoundInput } from "./types.ts";

function validHoles(): HandicapHoleInput[] {
  return Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, score: 4, putts: 2, fir: true, gir: true }));
}

function validInput(overrides: Partial<SubmitHandicapRoundInput> = {}): SubmitHandicapRoundInput {
  return { courseId: "course-1", teeSetId: "tee-1", datePlayed: "2026-09-07", teeTime: "8:15 AM", holes: validHoles(), ...overrides };
}

test("validateSubmitInput accepts a well-formed submission", () => {
  assert.deepEqual(validateSubmitInput(validInput()), { ok: true });
});

test("validateSubmitInput rejects a missing course", () => {
  const result = validateSubmitInput(validInput({ courseId: "" }));
  assert.equal(result.ok, false);
});

test("validateSubmitInput rejects a bad date format", () => {
  const result = validateSubmitInput(validInput({ datePlayed: "09/07/2026" }));
  assert.equal(result.ok, false);
});

test("validateSubmitInput rejects fewer than 18 holes", () => {
  const result = validateSubmitInput(validInput({ holes: validHoles().slice(0, 17) }));
  assert.equal(result.ok, false);
});

test("validateSubmitInput rejects a duplicate hole number", () => {
  const holes = validHoles();
  holes[1] = { ...holes[1], hole: 1 }; // hole 1 entered twice, hole 2 missing
  const result = validateSubmitInput(validInput({ holes }));
  assert.equal(result.ok, false);
});

test("validateSubmitInput rejects a hole with no score", () => {
  const holes = validHoles();
  // @ts-expect-error deliberately invalid for the test
  holes[0] = { ...holes[0], score: undefined };
  const result = validateSubmitInput(validInput({ holes }));
  assert.equal(result.ok, false);
});

test("validateSubmitInput rejects a negative putts count", () => {
  const holes = validHoles();
  holes[0] = { ...holes[0], putts: -1 };
  const result = validateSubmitInput(validInput({ holes }));
  assert.equal(result.ok, false);
});
