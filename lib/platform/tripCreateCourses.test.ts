import { test } from "node:test";
import assert from "node:assert/strict";
import { pickedCoursesForSlots, tripCoursePicks } from "./tripCreateCourses";

test("only rounds picked from the search (a handle and a name) are picks; typed-only names aren't", () => {
  const draft = {
    round1Course: "Pinehurst No. 2", round1CourseRef: "abc-123", round1CoursePlace: "Pinehurst, NC", round1CoursePar: "72",
    round2Course: "Some muni", round2CourseRef: "",
    round3Course: "", round3CourseRef: "xyz",
    round4Course: "Bad handle", round4CourseRef: "has spaces/slash",
    round5Course: "Odd par", round5CourseRef: "p5", round5CoursePar: "500",
  };
  assert.deepEqual(tripCoursePicks(draft, [1, 2, 3, 4, 5, 6]), [
    { roundNumber: 1, ref: "abc-123", name: "Pinehurst No. 2", place: "Pinehurst, NC", par: 72 },
    { roundNumber: 5, ref: "p5", name: "Odd par", place: "", par: null },
  ]);
  assert.deepEqual(tripCoursePicks({ round1Course: "x".repeat(201), round1CourseRef: "a" }, [1]), []);
  assert.deepEqual(tripCoursePicks({ round1Course: 5, round1CourseRef: "a" }, [1]), []);
});

test("each pick goes to its round's Trip Settings slot; rounds without a slot are skipped", () => {
  const picks = [
    { roundNumber: 1, ref: "a", name: "A", place: "", par: 72 },
    { roundNumber: 3, ref: "c", name: "C", place: "X", par: null },
    { roundNumber: 9, ref: "z", name: "Z", place: "", par: null },
  ];
  assert.deepEqual(pickedCoursesForSlots(["0-0", "0-1", "1-0"], picks), {
    "0-0": { ref: "a", name: "A", place: "", par: 72 },
    "1-0": { ref: "c", name: "C", place: "X", par: null },
  });
});
