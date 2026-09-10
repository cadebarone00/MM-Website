import { test } from "node:test";
import assert from "node:assert/strict";
import { mapGolfCoreCourse, mapGolfCoreSearch } from "./golfCoreMapping";
import { refreshGolfTees } from "./golfApiMapping";

const fixture = () => ({ slug: "example", name: "Example Club", hole_count: 18, layouts: [{ name: "Main", holes: [{ position: 1, par: 5, yards: 999 }], tees: [
  { name: "Blue", gender: "M", rating: 72.1, slope: 130, holes: [{ position: 2, par: 4, yards: 400 }] },
  { name: "Blue", gender: "F", rating: 75, slope: 140, holes: [] },
] }] });

test("GolfCore search uses slugs and catalog total", () => {
  const result = mapGolfCoreSearch({ total: 250, courses: [fixture()] });
  assert.equal(result.total, 250);
  assert.equal(result.courses[0].id, "example");
  assert.equal(result.courses[0].holes, 18);
});
test("GolfCore preserves missing tee data and separates gender ratings", () => {
  const result = mapGolfCoreCourse(fixture(), "example", "now");
  assert.equal(result.teeSets.length, 2);
  assert.equal(result.teeSets[0].holes[0].yards, 0);
  assert.equal(result.teeSets[0].holes[0].par, 0);
  assert.equal(result.teeSets[0].holes[1].yards, 400);
  assert.equal(result.teeSets[1].name, "Blue (Women)");
  assert.equal(result.teeSets[1].rating, 75);
  assert.equal(result.teeSets[1].locked, false);
  assert.throws(() => mapGolfCoreCourse(fixture(), "wrong", "now"), /unexpected/);
  assert.throws(() => mapGolfCoreCourse({ ...fixture(), hole_count: 9 }, "example", "now"), /18-hole/);
});
test("GolfCore links legacy provider tees without duplicating or changing score references", () => {
  const incoming = mapGolfCoreCourse(fixture(), "example", "now").teeSets;
  const old = { ...incoming[0], id: "saved-tee", rating: 70, apiSource: { ...incoming[0].apiSource!, provider: undefined, courseId: "123" } };
  const linked = refreshGolfTees([old], incoming);
  assert.equal(linked.length, 2);
  assert.equal(linked[0].id, "saved-tee");
  assert.equal(linked[0].rating, 70);
  assert.equal(linked[0].apiSource?.provider, "golfcore");
  assert.equal(refreshGolfTees(linked, incoming).length, 2);
  const changed = fixture(); changed.layouts[0].tees[0].slope = 135;
  assert.equal(refreshGolfTees(linked, mapGolfCoreCourse(changed, "example", "later").teeSets)[0].slope, 135);
});
