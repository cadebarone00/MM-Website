/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { builtParsFor, dayDate, dayText, guestName, newGuestId, toggleHole } from "./setupHelpers.ts";

test("days round-trip without slipping to another day", () => {
  assert.equal(dayText(new Date(2026, 10, 24, 23, 59)), "2026-11-24");
  assert.equal(dayText(dayDate("2026-01-05")), "2026-01-05");
  assert.equal(dayDate("2026-01-05").getHours(), 12);
  assert.ok(dayDate("nonsense") instanceof Date);
});

test("guest ids are unique; names are trimmed to 40", () => {
  assert.notEqual(newGuestId(), newGuestId());
  assert.equal(guestName("  Uncle Rob  "), "Uncle Rob");
  assert.equal(guestName("x".repeat(50)).length, 40);
});

test("hole picker toggles and keeps holes in order", () => {
  assert.deepEqual(toggleHole([3, 12], 8), [3, 8, 12]);
  assert.deepEqual(toggleHole([3, 8, 12], 8), [3, 12]);
});

test("built pars are read safely", () => {
  const par = Array.from({ length: 18 }, () => 4);
  assert.deepEqual(builtParsFor(JSON.stringify({ "custom:my-course": par }), "custom:my-course"), par);
  assert.equal(builtParsFor(JSON.stringify({}), "custom:x"), undefined);
  assert.equal(builtParsFor("not json", "custom:x"), undefined);
  assert.equal(builtParsFor(null, "custom:x"), undefined);
});
