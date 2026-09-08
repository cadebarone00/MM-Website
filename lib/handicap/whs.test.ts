// lib/handicap/whs.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateDifferential, calculateHandicapIndex, calculateLowIndex } from "./whs.ts";

test("calculateDifferential matches the WHS formula, rounded to 1 decimal", () => {
  // (90 - 72.4) * 113 / 130 = 15.298... -> 15.3
  assert.equal(calculateDifferential(90, 72.4, 130), 15.3);
  // (78 - 71.0) * 113 / 120 = 6.5917 -> 6.6
  assert.equal(calculateDifferential(78, 71.0, 120), 6.6);
});

test("calculateHandicapIndex returns null with no rounds", () => {
  assert.equal(calculateHandicapIndex([]), null);
});

test("calculateHandicapIndex returns null with fewer than 3 rounds (real WHS minimum)", () => {
  assert.equal(calculateHandicapIndex([10.0]), null);
  assert.equal(calculateHandicapIndex([10.0, 5.0]), null);
});

test("calculateHandicapIndex with 3 rounds: lowest 1, adjustment -2.0", () => {
  // sorted [5,8,10], lowest 1 = 5.0, -2.0 -> 3.0
  assert.equal(calculateHandicapIndex([10.0, 5.0, 8.0]), 3.0);
});

test("calculateHandicapIndex with 5 rounds: lowest 1, no adjustment", () => {
  // sorted [5,6,8,10,12], lowest 1 = 5.0, +0 -> 5.0
  assert.equal(calculateHandicapIndex([10.0, 5.0, 8.0, 12.0, 6.0]), 5.0);
});

test("calculateHandicapIndex with 8 rounds: lowest 2 averaged, no adjustment", () => {
  const diffs = [10.0, 5.0, 8.0, 12.0, 6.0, 9.0, 11.0, 4.0];
  // lowest 2: 4.0, 5.0 -> avg 4.5
  assert.equal(calculateHandicapIndex(diffs), 4.5);
});

test("calculateHandicapIndex with 20 rounds: lowest 8 averaged", () => {
  const diffs = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20
  // lowest 8: 1..8 -> avg 4.5
  assert.equal(calculateHandicapIndex(diffs), 4.5);
});

test("calculateHandicapIndex caps at the most recent 20 even if more are passed", () => {
  const diffs = Array.from({ length: 25 }, () => 20.0);
  diffs[24] = 1.0; // a 25th entry should never be considered
  assert.equal(calculateHandicapIndex(diffs), 20.0);
});

test("calculateHandicapIndex never applies a positive adjustment (real WHS has none)", () => {
  // 4 rounds: lowest differential is 5.0, adjustment is -1.0 here -> index must be <= 5.0.
  assert.ok(calculateHandicapIndex([10.0, 5.0, 8.0, 12.0])! <= 5.0);
  // 5 rounds: lowest differential is 5.0, adjustment is 0 here -> index must be <= 5.0.
  assert.ok(calculateHandicapIndex([10.0, 5.0, 8.0, 12.0, 6.0])! <= 5.0);
});

test("calculateLowIndex tracks the minimum index across round history", () => {
  // After round 1 ([10]): null (fewer than 3 rounds).
  // After round 2 ([10,5]): null (fewer than 3 rounds).
  // After round 3 ([10,5,8]): 3 rounds, lowest 1 (5.0), -2.0 adj -> index 3.0.
  // Only one non-null value across the replay, so the minimum is 3.0.
  assert.equal(calculateLowIndex([10.0, 5.0, 8.0]), 3.0);
});

test("calculateLowIndex returns null with no rounds", () => {
  assert.equal(calculateLowIndex([]), null);
});
