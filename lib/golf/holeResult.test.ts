import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyHole, isBirdieOrBetter, isBogeyOrWorse, isParOrBetter, markerForToPar, resultFor, scoreNameForToPar, shapeForToPar, type HoleShape } from "./holeResult.ts";
import { holeMarker } from "../data/index.ts";
import { skinsScoreLabel } from "../skins/scoreLabel.ts";

// ---- The implementations this module replaced, copied verbatim (2026-10-20) as the regression reference. ----
// lib/data/index.ts holeMarker
function legacyHoleMarker(diff: number) {
  if (diff <= -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  return "double-or-worse";
}
// components/scorecard/HoleMarker.tsx SHAPE
const LEGACY_SHAPE = {
  eagle: { outline: "circle", rings: 2 }, birdie: { outline: "circle", rings: 1 }, par: { outline: "none", rings: 0 },
  bogey: { outline: "square", rings: 1 }, "double-or-worse": { outline: "square", rings: 2 },
} as const;
// components/platform/GolfTripScoring.tsx scoreShape (class names → shape)
function legacyScoreShape(toPar: number): HoleShape {
  return toPar <= -2 ? { outline: "circle", rings: 2 } : toPar === -1 ? { outline: "circle", rings: 1 }
    : toPar === 1 ? { outline: "square", rings: 1 } : toPar >= 2 ? { outline: "square", rings: 2 } : { outline: "none", rings: 0 };
}
// components/platform/GolfTripMatch.tsx scoreMark and components/profile/ProfileRoundSheet.tsx scoreMark (identical)
function legacyScoreMark(toPar: number): HoleShape {
  if (toPar <= -2) return { outline: "circle", rings: 2 };
  if (toPar === -1) return { outline: "circle", rings: 1 };
  if (toPar === 1) return { outline: "square", rings: 1 };
  if (toPar >= 2) return { outline: "square", rings: 2 };
  return { outline: "none", rings: 0 };
}
// lib/skins/scoreLabel.ts skinsScoreLabel
function legacySkinsLabel(score: number, par: number | null): string {
  if (par == null) return "Par unavailable";
  const diff = score - par;
  if (diff === 0) return "Par";
  if (diff === -1) return "Birdie";
  if (diff === -2) return "Eagle";
  if (diff === -3) return "Albatross";
  if (diff === 1) return "Bogey";
  if (diff === 2) return "Double bogey";
  if (diff === 3) return "Triple bogey";
  return `${Math.abs(diff)} ${diff < 0 ? "under" : "over"} par`;
}
// ---------------------------------------------------------------------------------------------------------------

const TO_PAR = Array.from({ length: 15 }, (_, i) => i - 6); // −6 … +8

test("scorecard shapes and buckets are unchanged for every score against par", () => {
  for (const toPar of TO_PAR) {
    assert.equal(markerForToPar(toPar), legacyHoleMarker(toPar), `marker ${toPar}`);
    assert.equal(holeMarker(toPar), legacyHoleMarker(toPar), `lib/data holeMarker ${toPar}`);
    assert.deepEqual(shapeForToPar(toPar), LEGACY_SHAPE[legacyHoleMarker(toPar)], `HoleMarker shape ${toPar}`);
    assert.deepEqual(shapeForToPar(toPar), legacyScoreShape(toPar), `GolfTripScoring scoreShape ${toPar}`);
    assert.deepEqual(shapeForToPar(toPar), legacyScoreMark(toPar), `scoreMark ${toPar}`);
  }
});

test("skins words are unchanged for every score and par, including no par", () => {
  for (const par of [3, 4, 5, 6]) for (let score = 1; score <= 12; score++) assert.equal(skinsScoreLabel(score, par), legacySkinsLabel(score, par), `${score} on a par ${par}`);
  assert.equal(skinsScoreLabel(4, null), "Par unavailable");
  assert.equal(scoreNameForToPar(-3), "Albatross", "an ace on a par 4 is still called Albatross on the skins board");
});

test("stat helpers keep Golf → Stats' meanings: 'birdies' is birdie or better", () => {
  assert.deepEqual(TO_PAR.filter(isBirdieOrBetter), TO_PAR.filter((t) => t < 0));
  assert.deepEqual(TO_PAR.filter(isParOrBetter), TO_PAR.filter((t) => t <= 0));
  assert.deepEqual(TO_PAR.filter(isBogeyOrWorse), TO_PAR.filter((t) => t > 0));
});

test("result: ace, albatross, eagle, birdie, par, bogey, double bogey, triple or worse — from strokes and the real par", () => {
  const cases: [number, number, string][] = [
    [1, 3, "ace"], [1, 4, "ace"], [1, 5, "ace"], [2, 5, "albatross"], [3, 6, "albatross"], [4, 7, "albatross"],
    [2, 4, "eagle"], [3, 5, "eagle"], [2, 3, "birdie"], [3, 4, "birdie"], [4, 4, "par"], [5, 4, "bogey"], [6, 4, "double-bogey"], [7, 4, "triple-or-worse"], [11, 4, "triple-or-worse"],
  ];
  for (const [strokes, par, result] of cases) assert.equal(classifyHole(strokes, par).result, result, `${strokes} on a par ${par}`);
  assert.equal(resultFor(1, -2), "ace");
  // Albatross is exactly 3 under and never a 1; 4+ under without an ace has no name (and still draws the double circle).
  assert.equal(classifyHole(1, 5).result, "ace", "a 1 on a par 5 is an ace, not an albatross");
  assert.deepEqual(classifyHole(2, 6), { result: null, toPar: -4, marker: "eagle", shape: { outline: "circle", rings: 2 } });
  assert.equal(classifyHole(3, 7).result, null);
  // An ace keeps the scorecard's eagle double circle on a par 3, exactly as before.
  assert.deepEqual(classifyHole(1, 3), { result: "ace", toPar: -2, marker: "eagle", shape: { outline: "circle", rings: 2 } });
});

test("missing or invalid par: unknown, no shape, nothing guessed — except an ace, which needs no par", () => {
  for (const par of [null, undefined, 0, 1, 8, 4.5, Number.NaN]) {
    assert.deepEqual(classifyHole(4, par as number), { result: null, toPar: null, marker: null, shape: null }, String(par));
    assert.deepEqual(classifyHole(1, par as number), { result: "ace", toPar: null, marker: null, shape: null }, `ace, par ${par}`);
  }
});
