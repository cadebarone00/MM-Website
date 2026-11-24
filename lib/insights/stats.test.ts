import { test } from "node:test";
import assert from "node:assert/strict";
import { filterRounds, insights, type InsightsFilter } from "./stats.ts";
import { sampleInsightsRounds } from "../dev/sampleInsightsRounds.ts";
import type { ProfileHistoryRound } from "../platform/playerRoundsRows.ts";

const ALL: InsightsFilter = { range: "all", only18: false, today: "2026-11-24" };
type Hole = ProfileHistoryRound["holes"][number];
const hole = (number: number, par: number, strokes: number, extra: Partial<Hole> = {}): Hole => ({ number, par, strokes, putts: null, fairway: null, green: null, ...extra });
const round = (id: string, date: string, holes: Hole[], part: Partial<ProfileHistoryRound> = {}): ProfileHistoryRound => ({
  id, source: "personal", datePlayed: date, course: { ref: null, name: "Test Course", place: "" }, tee: null, holesPlayed: holes.length === 9 ? 9 : 18, format: "Stroke Play",
  holes, total: holes.reduce((a, h) => a + h.strokes, 0), countsForHandicap: false, notCountedReason: null, differential: null, enteredBy: "player", status: "submitted", ...part,
});
const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const evenPar = (id: string, date: string, tweak: (h: number) => Partial<Hole> = () => ({})) => round(id, date, pars.map((p, h) => hole(h + 1, p, p, tweak(h))));

test("no rounds: nothing breaks, everything is empty or blank", () => {
  const s = insights([], ALL);
  assert.equal(s.rounds, 0);
  assert.deepEqual([s.overview.scoringAverage, s.overview.handicapIndex, s.offTheTee.fairwaysPct, s.putting.puttsPerRound], [null, null, null, null]);
  assert.equal(s.records.longestParStreak, 0);
});

test("filters: last 10 / 20, this year, 18 holes only (newest first)", () => {
  const rounds = sampleInsightsRounds();
  assert.equal(filterRounds(rounds, { ...ALL, range: "last10" }).length, 10);
  assert.ok(filterRounds(rounds, { ...ALL, range: "year" }).every((r) => r.datePlayed.startsWith("2026")));
  assert.ok(filterRounds(rounds, { ...ALL, only18: true }).every((r) => r.holesPlayed === 18));
  const newest = filterRounds(rounds, ALL);
  assert.ok(newest[0].datePlayed >= newest.at(-1)!.datePlayed);
});

test("scoring: averages, score mix, par 3/4/5, front and back, bounce-backs", () => {
  // Round 1: even par except a birdie on 1 and a bogey on 2 then a birdie on 3 (a bounce-back).
  const a = evenPar("a", "2026-01-01", (h) => h === 0 ? { strokes: 3 } : h === 1 ? { strokes: 5 } : h === 2 ? { strokes: 2 } : {});
  const b = evenPar("b", "2026-01-02");
  const s = insights([a, b], ALL);
  assert.equal(s.overview.scoringAverage, (71 + 72) / 2);
  assert.deepEqual([s.scoring.mix.birdie, s.scoring.mix.bogey, s.scoring.mix.par], [2, 1, 33]);
  assert.equal(s.scoring.bounceBackPct, 100);
  assert.equal(s.scoring.bogeyFreeRounds, 1);
  assert.equal(s.scoring.byPar.find((p) => p.par === 3)!.averageToPar, round1(-1 / 8));
  assert.equal(s.scoring.frontNine, -0.5, "front: -1 over two rounds = -0.5 per nine");
  assert.equal(s.scoring.backNine, 0);
  assert.equal(s.overview.lowestNine, 35);
});
const round1 = (n: number) => Math.round(n * 10) / 10;

test("off the tee, approach, putting: only tracked holes count; misses by direction; scrambling", () => {
  const tracked = evenPar("t", "2026-02-01", (h) => ({
    fairway: pars[h] === 3 ? null : h % 2 ? "center" : "left",
    green: h < 9 ? "center" : "down", putts: h < 9 ? 2 : 1,
  }));
  const untracked = evenPar("u", "2026-02-02");
  const s = insights([tracked, untracked], ALL);
  assert.equal(s.offTheTee.rounds, 1);
  assert.equal(s.offTheTee.drives, 14);
  assert.equal(s.offTheTee.fairwaysPct, round1((7 / 14) * 100));
  assert.equal(s.approach.girPct, 50);
  assert.equal(s.approach.miss.short, 100);
  assert.equal(s.putting.puttsPerRound, 27);
  assert.equal(s.putting.scramblingPct, 100, "every missed green still made par");
  assert.equal(s.putting.onePuttPct, 50);
});

test("records and groups: eagle, hole-in-one, par streak, courses and where you played", () => {
  const ace = evenPar("ace", "2026-03-01", (h) => h === 2 ? { strokes: 1 } : h === 3 ? { strokes: 3 } : {});
  const other = { ...evenPar("o", "2026-03-02", (h) => h === 5 ? { strokes: 6 } : {}), source: "trip" as const, course: { ref: null, name: "Other Course", place: "" } };
  const s = insights([ace, other], ALL);
  assert.equal(s.records.holesInOne.length, 1);
  assert.equal(s.records.eagles.length, 1);
  assert.equal(s.records.longestParStreak, 18);
  assert.deepEqual(s.courses.map((c) => c.name).sort(), ["Other Course", "Test Course"]);
  assert.deepEqual(s.sources.map((x) => x.name).sort(), ["Golf trips", "Play rounds"]);
});

test("9-hole rounds: no 18-hole average until there is an 18; per-round numbers count them as half", () => {
  const nine = round("n", "2026-04-01", pars.slice(0, 9).map((p, h) => hole(h + 1, p, p + 1)));
  const s = insights([nine], ALL);
  assert.equal(s.overview.scoringAverage, null);
  assert.equal(s.overview.averageToPar, 18, "+9 over 9 holes = +18 per 18");
});

test("the sample golfer fills every section", () => {
  const s = insights(sampleInsightsRounds(), ALL);
  assert.equal(s.rounds, 32);
  assert.ok(s.overview.handicapIndex !== null && s.offTheTee.fairwaysPct !== null && s.approach.girPct !== null && s.putting.puttsPerRound !== null);
  assert.ok(s.records.holesInOne.length === 1 && s.records.eagles.length >= 1);
  assert.ok(s.trends.score.length > 20 && s.courses.length === 4);
});
