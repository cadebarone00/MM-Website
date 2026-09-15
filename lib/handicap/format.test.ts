import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDifferential, formatHandicapIndex } from "./format";
import { calculateHandicapIndex } from "./whs";

test("plus handicaps invert the display sign, but round differentials do not", () => {
  assert.equal(formatHandicapIndex(-2.6), "+2.6");
  assert.equal(formatHandicapIndex(2.6), "2.6");
  assert.equal(formatDifferential(-2.6), "-2.6");
  assert.equal(formatDifferential(2.6), "2.6");
  assert.equal(formatHandicapIndex(-0), "0.0");
  assert.equal(formatHandicapIndex(null), "\u2014");
});
test("Cade's eleven eligible rounds use the lowest three differentials", () => {
  const index = calculateHandicapIndex([2.1, 0.2, 5.7, 6.2, -5.3, 3.7, 1.1, 0.4, -2.6, 1.1, 0.4]);
  assert.equal(index, -2.6);
  assert.equal(formatHandicapIndex(index), "+2.6");
});
