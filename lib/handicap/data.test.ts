// lib/handicap/data.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCourseRow } from "./data.ts";

test("mapCourseRow keeps only well-formed tee sets", () => {
  const row = {
    id: "course-1",
    name: "Pebble Beach",
    tee_sets: [
      { id: "blue", name: "Blue", rating: 74.5, slope: 142, holes: [{ number: 1, par: 4, yards: 400 }] },
      { id: "no-rating", name: "White", rating: null, slope: null, holes: [] }, // never set up — must be dropped
      { id: "broken" }, // malformed — must be dropped
    ],
  };
  const result = mapCourseRow(row);
  assert.equal(result.id, "course-1");
  assert.equal(result.name, "Pebble Beach");
  assert.equal(result.teeSets.length, 1);
  assert.equal(result.teeSets[0].id, "blue");
});

test("mapCourseRow handles a non-array tee_sets value", () => {
  const result = mapCourseRow({ id: "course-2", name: "Some Course", tee_sets: null });
  assert.deepEqual(result.teeSets, []);
});
