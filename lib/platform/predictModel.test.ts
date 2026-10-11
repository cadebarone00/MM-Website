import assert from "node:assert/strict";
import test from "node:test";
import type { ProfileHistoryRound } from "./playerRoundsRows";
import { buildPlayerModel, chanceOfLowest, chanceOfMostBirdies, chanceToBreak, forCourse, handicapProfile, headToHead, OUTCOMES, scoreRange, simulateTrip, tiltTo, totalBirdiesLine, type CourseSetup } from "./predictModel";

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const COURSE: CourseSetup = { par: PAR, rating: 72, slope: 113 };
const avg = (d: number[]) => d.reduce((a, p, i) => a + p * OUTCOMES[i], 0);

/** Rounds where every hole is par + `over[i % over.length]`. */
function rounds(count: number, over: number[]): ProfileHistoryRound[] {
  return Array.from({ length: count }, (_, n) => {
    const holes = PAR.map((par, i) => ({ number: i + 1, par, strokes: par + over[(i + n) % over.length], putts: null, fairway: null, green: null }));
    return { id: `r${n}`, holesPlayed: 18, holes, total: holes.reduce((a, h) => a + h.strokes, 0) } as unknown as ProfileHistoryRound;
  });
}

test("handicap profiles: a scratch golfer averages near par, a 20 near a bogey a hole; tilting hits its target", () => {
  assert.ok(Math.abs(avg(handicapProfile(0, 4))) < 0.25);
  assert.ok(avg(handicapProfile(20, 4)) > 0.9 && avg(handicapProfile(20, 4)) < 1.4);
  assert.ok(avg(handicapProfile(10, 3)) > avg(handicapProfile(10, 5)), "par 3s play harder than par 5s");
  assert.ok(Math.abs(avg(tiltTo(handicapProfile(10, 4), 0.8)) - 0.8) < 0.001);
});

test("a player's own history counts more as they play more", () => {
  const few = buildPlayerModel("a", "A", rounds(1, [0]), 15);
  const many = buildPlayerModel("a", "A", rounds(20, [0]), 15);
  assert.ok(avg(many.byPar[4]) < avg(few.byPar[4]), "20 rounds of all pars pull a 15-handicap's profile toward par");
  assert.ok(avg(many.byPar[4]) < 0.15);
  assert.equal(buildPlayerModel("b", "B", [], 18).holes, 0, "no rounds = handicap profile only");
});

test("same seed, same odds; a better player is more likely to post the low round; chances add up to 1", () => {
  const good = buildPlayerModel("g", "Good", rounds(15, [0, 0, 0, 1, -1, 0]), 4);
  const mid = buildPlayerModel("m", "Mid", rounds(15, [1, 0, 1, 2, 0, 1]), 14);
  const high = buildPlayerModel("h", "High", rounds(15, [1, 2, 1, 2, 1, 3]), 25);
  const sim = simulateTrip([good, mid, high], [COURSE, COURSE], 4000, 9);
  const again = simulateTrip([good, mid, high], [COURSE, COURSE], 4000, 9);
  const low = chanceOfLowest(sim, 0);
  assert.deepEqual(low, chanceOfLowest(again, 0));
  assert.ok(Math.abs(low.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(low[0] > low[1] && low[1] > low[2]);
  assert.ok(chanceOfLowest(sim, "trip")[0] > low[0] - 0.05, "over two rounds the better player wins at least as often");
  assert.ok(chanceOfMostBirdies(sim, "trip")[0] > 0.5);
  const [a, b, tie] = headToHead(sim, 0, 2, 0);
  assert.ok(Math.abs(a + b + tie - 1) < 1e-9 && a > 0.8);
});

test("break 80, the birdie line and score ranges look like golf", () => {
  const mid = buildPlayerModel("m", "Mid", rounds(15, [1, 0, 1, 2, 0, 1]), 14);
  const sim = simulateTrip([mid], [COURSE], 4000, 3);
  const range = scoreRange(sim, 0, 0);
  assert.ok(range.expected > 80 && range.expected < 92, String(range.expected));
  assert.ok(range.low < range.expected && range.high > range.expected);
  const breaks80 = chanceToBreak(sim, 0, 0, 80);
  assert.ok(breaks80 > 0 && breaks80 < 0.35);
  assert.ok(totalBirdiesLine(sim, 0).line === 0.5, "a golfer who rarely birdies gets the lowest line");
  // A group that makes birdies gets a line near an even split.
  const birdiers = [0, 1, 2].map((i) => buildPlayerModel(`b${i}`, `B${i}`, rounds(15, [0, -1, 0, 1, 0, 0]), 6));
  const line = totalBirdiesLine(simulateTrip(birdiers, [COURSE], 4000, 5), 0);
  assert.ok(line.line > 1 && line.over > 0.3 && line.over < 0.7, JSON.stringify(line));
});

test("a harder course (higher rating / slope) means higher scores", () => {
  const mid = buildPlayerModel("m", "Mid", rounds(10, [1, 0, 1, 2, 0, 1]), 14);
  const hard = forCourse(mid, { par: PAR, rating: 75, slope: 140 });
  assert.ok(avg(hard.byPar[4]) > avg(mid.byPar[4]) + 0.2);
});
