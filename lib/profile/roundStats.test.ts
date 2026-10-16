import assert from "node:assert/strict";
import test from "node:test";
import type { ProfileHistoryRound } from "../platform/playerRoundsRows";
import { roundStats } from "./roundStats";

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
/** An 18-hole round: par everywhere except `changes` (hole index → strokes); stats optional. */
function round(id: string, date: string, changes: Record<number, number> = {}, extra: Partial<ProfileHistoryRound> = {}, stats = true): ProfileHistoryRound {
  const holes = PAR.map((par, i) => ({ number: i + 1, par, strokes: changes[i] ?? par,
    putts: stats ? (i === 0 ? 3 : i === 1 ? 1 : 2) : null, fairway: stats && par !== 3 ? (i === 0 ? "left" as const : "center" as const) : null, green: stats ? (i === 2 ? "right" as const : "center" as const) : null }));
  const total = holes.reduce((s, h) => s + h.strokes, 0);
  return { id, source: "personal", datePlayed: date, course: { ref: null, name: "Stevens", place: "Dallas, TX" }, tee: { name: "Blue", rating: 72, slope: 113 },
    holesPlayed: 18, format: "Stroke Play", holes, total, countsForHandicap: true, notCountedReason: null, differential: total - 72, enteredBy: "player", status: "submitted", ...extra } as ProfileHistoryRound;
}

test("no rounds = no stats", () => assert.equal(roundStats([]), null));

test("averages, best, handicap and trend order", () => {
  const stats = roundStats([round("a", "2026-10-01", { 0: 6 }), round("b", "2026-10-05", { 1: 4 }), round("c", "2026-10-03", { 2: 4, 3: 5 })])!;
  assert.equal(stats.rounds, 3);
  assert.equal(stats.average18, 73);
  assert.deepEqual(stats.best18, { total: 71, course: "Stevens", date: "2026-10-05" });
  assert.deepEqual(stats.trend.map((p) => p.date), ["2026-10-01", "2026-10-03", "2026-10-05"]);
  assert.deepEqual(stats.trend.map((p) => p.toPar), [2, 2, -1]);
  assert.equal(stats.trend[0].holes, 18);
  assert.equal(stats.countingRounds, 3);
  assert.notEqual(stats.handicapIndex, null);
});

test("adjusted average caps each hole at double bogey; only full 18-hole cards count", () => {
  // a: a 9 on a par 4 counts as 6 → 74 (raw 77); b: 71 (nothing to cap).
  const nine = { ...round("n", "2026-10-02"), holesPlayed: 9 as const, holes: round("n", "2026-10-02").holes.slice(0, 9), total: 36 };
  const partial = { ...round("p", "2026-10-04", { 0: 9 }), holes: round("p", "2026-10-04").holes.slice(0, 17) };
  const stats = roundStats([round("a", "2026-10-01", { 0: 9 }), round("b", "2026-10-05", { 1: 4 }), nine, partial])!;
  assert.equal(stats.adjustedAverage18, 72.5);
  assert.equal(roundStats([nine])!.adjustedAverage18, null);
});

test("scoring mix, par types, putting, driving, approach and scrambling", () => {
  const stats = roundStats([round("a", "2026-10-01", { 0: 6, 1: 4, 2: 3 })])!;
  assert.deepEqual(stats.scoring, { holes: 18, eagles: 0, birdies: 1, pars: 16, bogeys: 0, doubles: 1, birdiePct: 6, parOrBetterPct: 94, doublePct: 6 });
  assert.deepEqual(stats.byPar.map((p) => [p.par, p.holes]), [[3, 4], [4, 10], [5, 4]]);
  assert.equal(stats.putting?.perRound, 36);
  assert.equal(stats.putting?.threePuttPct, 6);
  assert.equal(stats.driving?.fairwayPct, 93);
  assert.equal(stats.driving?.missLeftPct, 100, "the only miss with a direction went left");
  assert.equal(stats.approach?.girPct, 94);
  assert.deepEqual(stats.scrambling, { chances: 1, pct: 100 }, "missed the green on the par 3 and made par");
});

test("rounds without hole stats still give scores, but no putting / driving", () => {
  const stats = roundStats([round("a", "2026-10-01", {}, {}, false), round("b", "2026-09-01", {}, { holesPlayed: 9, total: 38, holes: [] })])!;
  assert.equal(stats.putting, null);
  assert.equal(stats.driving, null);
  assert.equal(stats.nines, 1);
  assert.equal(stats.average9, 38);
  assert.equal(stats.courses[0].rounds, 2);
});

test("old Maroon rounds: a blank next to recorded hits is a miss; a round with no hits isn't tracked", () => {
  const legacy = (id: string, hits: number) => {
    const r = round(id, "2026-05-01", {}, { source: "legacy" } as Partial<ProfileHistoryRound>, false);
    // Hits only on the first `hits` driving holes / greens; everything else blank (how the import stores misses).
    let fairways = 0;
    return { ...r, holes: r.holes.map((h, i) => ({ ...h, fairway: h.par !== 3 && fairways++ < hits ? "center" as const : null, green: i < hits ? "center" as const : null })) };
  };
  const stats = roundStats([legacy("a", 7), legacy("b", 0)])!;
  assert.equal(stats.driving?.holes, 14, "only round a counts: its 14 driving holes");
  assert.equal(stats.driving?.fairwayPct, 50);
  assert.equal(stats.driving?.missLeftPct, null, "old rounds never recorded a direction");
  assert.equal(stats.approach?.holes, 18);
  assert.equal(stats.approach?.girPct, 39);
});
