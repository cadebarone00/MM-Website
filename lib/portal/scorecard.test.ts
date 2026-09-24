import { test } from "node:test";
import assert from "node:assert/strict";
import { firstIncompleteHole, isRoundComplete, scorecardTotals, type ScorecardHoleRow } from "./scorecard.ts";

function row(hole: number, score: number | null): ScorecardHoleRow {
  return { hole, par: 4, yards: 400, score, putts: score == null ? null : 2, fir: score == null ? null : true, firDirection: null, gir: score == null ? null : true, girDirection: null };
}

test("isRoundComplete is true only once every hole has a recorded score", () => {
  assert.equal(isRoundComplete([row(1, 4), row(2, null), row(3, 5)]), false);
  assert.equal(isRoundComplete([row(1, 4), row(2, 3), row(3, 5)]), true);
  assert.equal(isRoundComplete([]), true);
});

test("firstIncompleteHole finds the first hole missing a score, or null once complete", () => {
  assert.equal(firstIncompleteHole([row(1, 4), row(2, null), row(3, null)]), 2);
  assert.equal(firstIncompleteHole([row(1, 4), row(2, 3)]), null);
});

const full = (overrides: Partial<ScorecardHoleRow>): ScorecardHoleRow => ({ hole: 1, par: 4, yards: 400, score: 4, putts: 2, fir: true, firDirection: null, gir: true, girDirection: null, ...overrides });

test("scorecardTotals adds up score, to-par, putts, fairways and greens across the holes entered", () => {
  const totals = scorecardTotals([
    full({ hole: 1, score: 5, putts: 2, fir: false, firDirection: "left", gir: false, girDirection: "short" }),
    full({ hole: 2, par: 3, score: 3, putts: 1, fir: null, gir: true }),
    full({ hole: 3, par: 5, score: 4, putts: 3, fir: true, gir: true }),
  ]);
  assert.deepEqual(totals, { score: 12, toPar: 0, putts: 6, fairways: { hit: 1, total: 2 }, greens: { hit: 2, total: 3 } });
});

test("scorecardTotals ignores holes that aren't entered yet, and reports nulls when none are", () => {
  const partial = scorecardTotals([full({ hole: 1, score: 6 }), row(2, null)]);
  assert.equal(partial.score, 6);
  assert.equal(partial.toPar, 2);
  assert.deepEqual(scorecardTotals([row(1, null)]), { score: null, toPar: null, putts: null, fairways: { hit: 0, total: 0 }, greens: { hit: 0, total: 0 } });
});

test("scorecardTotals leaves putts null when the format never records them", () => {
  const totals = scorecardTotals([full({ putts: null, fir: null, gir: null })]);
  assert.equal(totals.score, 4);
  assert.equal(totals.putts, null);
  assert.deepEqual(totals.fairways, { hit: 0, total: 0 });
});
