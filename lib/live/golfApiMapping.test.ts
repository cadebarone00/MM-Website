import { test } from "node:test";
import assert from "node:assert/strict";
import { mapGolfCourse, mapGolfSearch, refreshGolfTees } from "./golfApiMapping.ts";

function payload() {
  return { courseID: "123", clubName: "Example Club", courseName: "North", numHoles: "18", measure: "y", parsMen: Array(18).fill(4), parsWomen: Array(18).fill(5), tees: [{ teeID: "1", teeName: "Blue", teeColor: "#0000ff", courseRatingMen: 72, slopeMen: 130, courseRatingWomen: 75, slopeWomen: 140, ...Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`length${i + 1}`, 400])) }] };
}
test("search mapping preserves provider IDs and disambiguates course layouts", () => {
  const result = mapGolfSearch({ courses: [payload()], numAllCourses: 400 });
  assert.equal(result.courses[0].id, "123");
  assert.equal(result.courses[0].name, "Example Club — North");
  assert.equal(result.total, 400);
});
test("import separates rating variants, converts meters and leaves missing data blank", () => {
  const data = payload(); data.measure = "m";
  const result = mapGolfCourse(data, "123", "2026-09-10");
  assert.equal(result.teeSets.length, 2);
  assert.equal(result.teeSets[0].holes[0].yards, 437);
  assert.equal(result.teeSets[1].holes[0].par, 5);
  assert.equal(result.teeSets[1].rating, 75);
  assert.equal(result.teeSets[0].locked, false);
  assert.throws(() => mapGolfCourse({ ...data, numHoles: 9 }, "123", "now"), /18-hole/);
  assert.throws(() => mapGolfCourse(data, "wrong", "now"), /unexpected course/);
  const missing = mapGolfCourse({ ...data, parsMen: [], tees: [{ teeID: "2", teeName: "White" }] }, "123", "now").teeSets[0];
  assert.equal(missing.rating, null);
  assert.equal(missing.holes[0].par, 0);
  assert.equal(missing.holes[0].yards, 0);
});
test("refresh preserves manual overrides and IDs while updating untouched values", () => {
  const original = mapGolfCourse(payload(), "123", "before").teeSets;
  const local = original.map((tee) => ({ ...tee, locked: true, rating: 71, holes: tee.holes.map((hole) => hole.number === 1 ? { ...hole, yards: 444 } : hole) }));
  const data = payload(); data.tees[0].slopeMen = 135;
  const incoming = mapGolfCourse(data, "123", "after").teeSets;
  const result = refreshGolfTees(local, incoming);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, original[0].id);
  assert.equal(result[0].rating, 71);
  assert.equal(result[0].holes[0].yards, 444);
  assert.equal(result[0].slope, 135);
  assert.equal(result[0].locked, false);
  assert.equal(result[1].locked, true);
  assert.equal(local[0].slope, 130);
  assert.equal(refreshGolfTees(result, incoming).length, 2);
});
