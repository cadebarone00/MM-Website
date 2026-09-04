import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRIORITIES, effectivePriority } from "./priority.ts";

test("DEFAULT_PRIORITIES matches the master spec's §13 tiers for Phase 2's event kinds", () => {
  assert.deepEqual(DEFAULT_PRIORITIES, {
    ROUND_STARTED: 0,
    SCORE_POSTED: 10,
    MATCH_STATE_CHANGED: 40,
    MATCH_WON: 70,
    ROUND_FINAL: 75,
  });
});

test("effectivePriority adds no bonus at 0 minutes waiting", () => {
  const now = new Date("2027-01-06T12:00:00Z");
  assert.equal(effectivePriority(40, now.toISOString(), now), 40);
});

test("effectivePriority adds 2 points per minute waited", () => {
  const createdAt = new Date("2027-01-06T12:00:00Z");
  const now = new Date("2027-01-06T12:05:00Z");
  assert.equal(effectivePriority(40, createdAt.toISOString(), now), 50);
});

test("effectivePriority clamps the aging bonus at +30", () => {
  const createdAt = new Date("2027-01-06T12:00:00Z");
  const now = new Date("2027-01-06T13:00:00Z");
  assert.equal(effectivePriority(40, createdAt.toISOString(), now), 70);
});

test("effectivePriority never goes negative when createdAt is slightly after now (clock skew)", () => {
  const createdAt = new Date("2027-01-06T12:00:05Z");
  const now = new Date("2027-01-06T12:00:00Z");
  assert.equal(effectivePriority(40, createdAt.toISOString(), now), 40);
});
