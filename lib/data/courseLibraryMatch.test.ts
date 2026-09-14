import { test } from "node:test";
import assert from "node:assert/strict";
import { matchCourseLibrary } from "./courseLibraryMatch";

const courses = ["Mission Hills CC - Palmer", "Mission Hills CC - Pete Dye", "Mission Hills CC - Dinah Shore Tournament", "Indian Wells CC - Classic", "Indian Wells CC - Cove", "Danzante Bay"].map((name, id) => ({ id: String(id), name }));
test("historical layout aliases resolve to their specific library course", () => {
  for (const [index, name] of ["Palmer", "Pete Dye #2", "Tournament", "Classic", "Cove", "Danzante Bay #3"].entries()) {
    assert.equal(matchCourseLibrary(name, courses)?.id, String(index));
  }
});
test("club spelling, capitalization and punctuation do not prevent a match", () => {
  assert.equal(matchCourseLibrary("MISSION HILLS Country Club / Palmer", courses)?.id, "0");
});
test("unknown, incomplete and ambiguous names never choose an arbitrary course", () => {
  assert.equal(matchCourseLibrary("Mission Hills", courses), null);
  assert.equal(matchCourseLibrary("", courses), null);
  assert.equal(matchCourseLibrary("Palmer", [...courses, { id: "duplicate", name: courses[0].name }]), null);
});
