// lib/data/archivedScorecards.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapHandicapSetup } from "./archivedScorecards.ts";

function validSetup() {
  return {
    courseId: "course-1",
    teeSetId: "blue",
    teeSetName: "Blue",
    rating: 74.5,
    slope: 142,
    holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, yards: 400 })),
  };
}

test("mapHandicapSetup passes through a well-formed tee setup", () => {
  const result = mapHandicapSetup(validSetup());
  assert.deepEqual(result, validSetup());
});

test("mapHandicapSetup returns null for null", () => {
  assert.equal(mapHandicapSetup(null), null);
});

test("mapHandicapSetup returns null for a non-object value", () => {
  assert.equal(mapHandicapSetup("not an object"), null);
});

test("mapHandicapSetup returns null when required fields are missing", () => {
  const malformed: Record<string, unknown> = validSetup();
  delete malformed.teeSetName;
  assert.equal(mapHandicapSetup(malformed), null);
});

test("mapHandicapSetup returns null when holes isn't an array", () => {
  assert.equal(mapHandicapSetup({ ...validSetup(), holes: "nope" }), null);
});

test("mapHandicapSetup accepts null rating/slope (never set up)", () => {
  const result = mapHandicapSetup({ ...validSetup(), rating: null, slope: null });
  assert.equal(result?.rating, null);
  assert.equal(result?.slope, null);
});

test("mapHandicapSetup preserves holeTeeSetIds when present", () => {
  const setup = { ...validSetup(), holeTeeSetIds: { "1": "blue", "2": "white" } };
  const result = mapHandicapSetup(setup);
  assert.deepEqual(result?.holeTeeSetIds, { "1": "blue", "2": "white" });
});
