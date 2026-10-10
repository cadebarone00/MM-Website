import assert from "node:assert/strict";
import test from "node:test";
import { milesBetween, nearestCourses, stateFromPoints } from "./nearbyCourses";

const course = (id: string, latitude: number | null, longitude: number | null) => ({ id, name: id, city: null, state: "TX", latitude, longitude, par: 72 });

test("distance in miles is right for a known pair (Dallas → Fort Worth ≈ 30 mi)", () => {
  const miles = milesBetween(32.7767, -96.797, 32.7555, -97.3308);
  assert.ok(miles > 29 && miles < 33, String(miles));
});

test("nearest first, skips courses without a map point and duplicates, limited", () => {
  const list = [course("far", 33.5, -97.5), course("near", 32.78, -96.8), course("nomap", null, null), course("near", 32.78, -96.8), course("mid", 32.9, -96.9)];
  const result = nearestCourses(list, 32.7767, -96.797, 2);
  assert.deepEqual(result.map((c) => c.ref), ["near", "mid"]);
  assert.equal(result[0].miles, 0.3);
});

test("state comes from the weather service's points reply", () => {
  assert.equal(stateFromPoints({ properties: { relativeLocation: { properties: { city: "Dallas", state: "TX" } } } }), "TX");
  assert.equal(stateFromPoints({ properties: {} }), null);
  assert.equal(stateFromPoints(null), null);
});
