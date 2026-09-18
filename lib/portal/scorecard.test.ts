import { test } from "node:test";
import assert from "node:assert/strict";
import { firstIncompleteHole, isRoundComplete, type ScorecardHoleRow } from "./scorecard.ts";

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
