import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSubmitInput, validateAssignArchiveTeesInput } from "./validate.ts";
import type { AssignArchiveTeesInput, HandicapHoleInput, SubmitHandicapRoundInput } from "./types.ts";

function validHoles(): HandicapHoleInput[] {
  return Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, score: 4, putts: 2, fir: true, gir: true, firDirection: null, girDirection: null }));
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

test("validateSubmitInput rejects a non-object input", () => {
  // @ts-expect-error deliberately invalid for the test
  const result = validateSubmitInput(null);
  assert.equal(result.ok, false);
});

test("validateSubmitInput rejects a non-object hole entry", () => {
  const holes = validHoles();
  // @ts-expect-error deliberately invalid for the test
  holes[0] = null;
  const result = validateSubmitInput(validInput({ holes }));
  assert.equal(result.ok, false);
});

test("validateSubmitInput rejects a decimal score", () => {
  const holes = validHoles();
  holes[0] = { ...holes[0], score: 4.5 };
  const result = validateSubmitInput(validInput({ holes }));
  assert.equal(result.ok, false);
});

test("validateSubmitInput accepts a valid miss direction", () => {
  const holes = validHoles();
  holes[0] = { ...holes[0], fir: false, firDirection: "left", gir: false, girDirection: "short" };
  assert.deepEqual(validateSubmitInput(validInput({ holes })), { ok: true });
});

test("validateSubmitInput rejects an invalid fairway direction", () => {
  const holes = validHoles();
  // @ts-expect-error deliberately invalid for the test
  holes[0] = { ...holes[0], firDirection: "sideways" };
  const result = validateSubmitInput(validInput({ holes }));
  assert.equal(result.ok, false);
});

function validAssignInput(overrides: Partial<AssignArchiveTeesInput> = {}): AssignArchiveTeesInput {
  return { tournamentSlug: "2025-danzante", round: 3, courseId: "course-1", teeSetId: "tee-1", datePlayed: "2025-06-14", ...overrides };
}

test("validateAssignArchiveTeesInput accepts a well-formed submission", () => {
  assert.deepEqual(validateAssignArchiveTeesInput(validAssignInput()), { ok: true });
});

test("validateAssignArchiveTeesInput rejects a missing tournament slug", () => {
  const result = validateAssignArchiveTeesInput(validAssignInput({ tournamentSlug: "" }));
  assert.equal(result.ok, false);
});

test("validateAssignArchiveTeesInput rejects a non-integer round", () => {
  const result = validateAssignArchiveTeesInput(validAssignInput({ round: 1.5 }));
  assert.equal(result.ok, false);
});

test("validateAssignArchiveTeesInput rejects a round below 1", () => {
  const result = validateAssignArchiveTeesInput(validAssignInput({ round: 0 }));
  assert.equal(result.ok, false);
});

test("validateAssignArchiveTeesInput rejects a missing course", () => {
  const result = validateAssignArchiveTeesInput(validAssignInput({ courseId: "" }));
  assert.equal(result.ok, false);
});

test("validateAssignArchiveTeesInput rejects a missing tee set", () => {
  const result = validateAssignArchiveTeesInput(validAssignInput({ teeSetId: "" }));
  assert.equal(result.ok, false);
});

test("validateAssignArchiveTeesInput rejects a bad date format", () => {
  const result = validateAssignArchiveTeesInput(validAssignInput({ datePlayed: "06/14/2025" }));
  assert.equal(result.ok, false);
});

test("validateAssignArchiveTeesInput rejects a non-object input", () => {
  // @ts-expect-error deliberately invalid for the test
  const result = validateAssignArchiveTeesInput(null);
  assert.equal(result.ok, false);
});
