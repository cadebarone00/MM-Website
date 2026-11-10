import { test } from "node:test";
import assert from "node:assert/strict";
import { areaCenter, areaKey, needsRefresh } from "./placeAreas.ts";

test("nearby trips share one area (≈5 km grid); same answers as the Python importer", () => {
  assert.equal(areaKey(33.4942, -111.9261), "33.50,-111.95");
  assert.equal(areaKey(33.5101, -111.9399), "33.50,-111.95", "a hotel a mile away → same area");
  assert.notEqual(areaKey(33.6, -111.93), areaKey(33.49, -111.93));
  assert.deepEqual(areaCenter("33.50,-111.95"), { latitude: 33.5, longitude: -111.95 });
  assert.equal(areaKey(-33.87, 151.21), "-33.85,151.20", "southern / eastern hemispheres");
  assert.equal(areaKey(35.1954, -79.4695), "35.20,-79.45", "Pinehurst (also checked in scripts/places/test_import_overture.py)");
});

test("refresh: never imported or older than 30 days", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  assert.equal(needsRefresh(null, now), true);
  assert.equal(needsRefresh("2026-10-20T12:00:00Z", now), false);
  assert.equal(needsRefresh("2026-09-20T12:00:00Z", now), true);
  assert.equal(needsRefresh("garbage", now), true);
});
