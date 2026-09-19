import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDifferential, formatHandicapIndex, formatRoundDate, formatToPar } from "./format";
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
test("a round date reads as a short month/day/year", () => {
  assert.equal(formatRoundDate("2026-09-07"), "Sep 7, 2026");
});
test("to-par shows E for even, a plus sign over par, and a dash when nothing is scored yet", () => {
  assert.equal(formatToPar(0), "E");
  assert.equal(formatToPar(3), "+3");
  assert.equal(formatToPar(-2), "-2");
  assert.equal(formatToPar(null), "—");
});
