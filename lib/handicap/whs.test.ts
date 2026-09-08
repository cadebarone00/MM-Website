// lib/handicap/whs.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateDifferential, calculateHandicapIndex, calculateLowIndex } from "./whs.ts";

test("calculateDifferential matches the WHS formula, rounded to 1 decimal", () => {
  // (90 - 72.4) * 113 / 130 = 15.303... -> 15.3
  assert.equal(calculateDifferential(90, 72.4, 130), 15.3);
  // (78 - 71.0) * 113 / 120 = 6.5917 -> 6.6
  assert.equal(calculateDifferential(78, 71.0, 120), 6.6);
});

test("calculateHandicapIndex returns null with no rounds", () => {
  assert.equal(calculateHandicapIndex([]), null);
});

test("calculateHandicapIndex with 1 round: that differential minus 2.0", () => {
  assert.equal(calculateHandicapIndex([10.0]), 8.0);
});

test("calculateHandicapIndex with 3 rounds: lowest 1, no adjustment", () => {
  assert.equal(calculateHandicapIndex([10.0, 5.0, 8.0]), 5.0);
});

test("calculateHandicapIndex with 5 rounds: lowest 1 plus 2.0", () => {
  assert.equal(calculateHandicapIndex([10.0, 5.0, 8.0, 12.0, 6.0]), 7.0);
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

test("calculateLowIndex tracks the minimum index across round history", () => {
  // After round 1 ([10]): 1 round used, -2.0 adj -> index 8.0.
  // After round 2 ([10,5]): 2 rounds, lowest 1 (5.0), -1.0 adj -> index 4.0 (lowest so far).
  // After round 3 ([10,5,8]): 3 rounds, lowest 1 (5.0), no adj -> index 5.0.
  // Minimum across all three points-in-time is 4.0.
  assert.equal(calculateLowIndex([10.0, 5.0, 8.0]), 4.0);
});

test("calculateLowIndex returns null with no rounds", () => {
  assert.equal(calculateLowIndex([]), null);
});
