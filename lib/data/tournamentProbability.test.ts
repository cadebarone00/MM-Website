import { test } from "node:test";
import assert from "node:assert/strict";
import { EVEN, historicalOddsSeries, liveOddsSeries, tournamentProbability } from "./tournamentProbability.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test("tournamentProbability with no matches is a tie", () => {
  assert.deepEqual(tournamentProbability([]), { maroon: 0, tie: 1, white: 0 });
});

test("tournamentProbability of one even match splits three ways", () => {
  const result = tournamentProbability([EVEN]);
  close(result.maroon, 1 / 3); close(result.tie, 1 / 3); close(result.white, 1 / 3);
});

test("tournamentProbability always sums to 1", () => {
  const result = tournamentProbability([{ maroon: 0.6, tie: 0.1, white: 0.3 }, EVEN, { maroon: 0.2, tie: 0.2, white: 0.6 }]);
  close(result.maroon + result.tie + result.white, 1);
});

test("historicalOddsSeries starts even-ish and ends 100% for the real winner", () => {
  const m = { maroonPts: 1, whitePts: 0, final: true }; const w = { maroonPts: 0, whitePts: 1, final: true }; const t = { maroonPts: 0.5, whitePts: 0.5, final: true };
  const series = historicalOddsSeries([[m, w], [m, t]]);
  assert.deepEqual(series.map((point) => point.label), ["Start", "After R1", "Final"]);
  assert.deepEqual(series.map((point) => point.x), [0, 1, 2]);
  close(series[0].maroon, series[0].white);
  assert.deepEqual({ maroon: series[2].maroon, tie: series[2].tie, white: series[2].white }, { maroon: 1, tie: 0, white: 0 });
});

test("historicalOddsSeries ends 100% tie for a tied tournament", () => {
  const final = historicalOddsSeries([[{ maroonPts: 1, whitePts: 0, final: true }, { maroonPts: 0, whitePts: 1, final: true }]]).at(-1)!;
  assert.equal(final.tie, 1);
});

test("historicalOddsSeries weighs multi-point matches by their real points", () => {
  // Maroon wins two 1-point matches, White wins one 3-point match: White wins 3–2.
  const final = historicalOddsSeries([[{ maroonPts: 1, whitePts: 0, final: true }, { maroonPts: 1, whitePts: 0, final: true }], [{ maroonPts: 0, whitePts: 3, final: true }]]).at(-1)!;
  assert.equal(final.white, 1);
});

test("historicalOddsSeries counts unscored matches as even, never as a result", () => {
  const final = historicalOddsSeries([[{ maroonPts: 0, whitePts: 0, final: false }]]).at(-1)!;
  close(final.maroon, 1 / 3);
});

test("tournamentProbability adds banked points before open matches", () => {
  assert.equal(tournamentProbability([EVEN], 1.5).maroon, 1); // a 1-point match can't erase a 1½ lead
});

test("liveOddsSeries uses pre-round odds for past points and latest odds for Now", () => {
  const opening = { maroon: 0.5, tie: 0, white: 0.5 };
  const latest = { maroon: 0.9, tie: 0, white: 0.1 };
  const series = liveOddsSeries([
    [{ result: "maroon", thru: 18, opening, latest: { maroon: 1, tie: 0, white: 0 } }],
    [{ result: null, thru: 9, opening, latest }],
  ]);
  assert.deepEqual(series.map((point) => point.label), ["Start", "After R1", "Now · R2"]);
  assert.equal(series[0].maroon, 0.25); // both 50/50 openers must go Maroon
  assert.deepEqual([series[1].maroon, series[1].tie], [0.5, 0.5]); // R1 won, R2 at its 50/50 opener
  assert.equal(series[2].x, 1.5);
  assert.deepEqual([series[2].maroon, series[2].tie], [0.9, 0.1]); // R2 at its latest 90/10 price
});

test("liveOddsSeries before any play has one Start point using latest odds", () => {
  const series = liveOddsSeries([[{ result: null, thru: 0, opening: null, latest: { maroon: 0.7, tie: 0.1, white: 0.2 } }]]);
  assert.equal(series.length, 1);
  assert.equal(series[0].label, "Start");
  assert.equal(series[0].maroon, 0.7);
});

test("liveOddsSeries with no odds posted treats matches as even", () => {
  const series = liveOddsSeries([[{ result: null, thru: 0, opening: null, latest: null }]]);
  close(series[0].maroon, 1 / 3);
});

test("liveOddsSeries with every round finished ends on Final", () => {
  const series = liveOddsSeries([[{ result: "white", thru: 18, opening: null, latest: null }]]);
  assert.deepEqual(series.map((point) => point.label), ["Start", "Final"]);
  assert.equal(series[1].white, 1);
});
