import { test } from "node:test";
import assert from "node:assert/strict";
import { rankAmong } from "./ranking.ts";

test("rankAmong is 1st when no one scores higher", () => {
  assert.equal(rankAmong([10, 8, 3], 10), 1);
});

test("rankAmong counts everyone strictly above", () => {
  assert.equal(rankAmong([15, 12, 8, 3], 8), 3);
});

test("rankAmong: ties share a rank", () => {
  assert.equal(rankAmong([10, 10, 8], 10), 1);
  assert.equal(rankAmong([10, 10, 8], 8), 3);
});

test("rankAmong works with just yourself in the list", () => {
  assert.equal(rankAmong([5], 5), 1);
});

test("rankAmong last place", () => {
  assert.equal(rankAmong([20, 15, 10, 5], 5), 4);
});
