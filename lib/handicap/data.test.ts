// lib/handicap/data.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapCourseRow, mapRoundRow } from "./data.ts";

test("mapCourseRow keeps only well-formed tee sets", () => {
  const row = {
    id: "course-1",
    name: "Pebble Beach",
    tee_sets: [
      { id: "blue", name: "Blue", locked: true, rating: 74.5, slope: 142, holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, yards: 400 })) },
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

test("mapRoundRow carries the course id through and reads the joined course name", () => {
  const result = mapRoundRow({
    id: "round-1",
    course_id: "course-1",
    tee_set_name: "Blue",
    rating: 74.5,
    slope: 142,
    date_played: "2026-09-01",
    tee_time: null,
    total_score: 88,
    differential: 12.3,
    live_courses: { name: "Pebble Beach" },
  });
  assert.equal(result.courseId, "course-1");
  assert.equal(result.courseName, "Pebble Beach");
});

test("mapRoundRow handles a missing joined course", () => {
  const result = mapRoundRow({
    id: "round-2",
    course_id: "course-2",
    tee_set_name: "White",
    rating: 71.2,
    slope: 128,
    date_played: "2026-09-02",
    tee_time: null,
    total_score: 95,
    differential: 18.1,
    live_courses: null,
  });
  assert.equal(result.courseName, "Unknown course");
});
