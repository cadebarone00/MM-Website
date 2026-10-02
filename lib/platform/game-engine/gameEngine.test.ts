import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateGame, scoreHole, sixesPairing, wolfForHole, validateSetup, type GameSetup, type HoleInput } from "./index";
import { vegasNumber } from "./vegas";
import { recommendedGames, type GameId } from "../golfTripGames";

const players = ["a", "b", "c", "d", "e"];
function setup(id: GameId, count = id === "9-point" || id === "wolf" ? 3 : id === "match-play" ? 2 : 4): GameSetup {
  return { id, scope: "round", participants: players.slice(0, count), handicap: false, rounds: [{ id: "r1", holes: 18 }] };
}
function input(scores: number[], hole = 1, extras: Partial<HoleInput> = {}): HoleInput {
  return { roundId: "r1", hole, scores: Object.fromEntries(scores.map((gross, index) => [players[index], { gross, net: gross - index }])), ...extras };
}

test("Match Play wins, halves, best ball, early completion and final ties", () => {
  const game = setup("match-play");
  assert.equal(scoreHole(game, input([4, 5])).winner, 0);
  assert.equal(scoreHole(game, input([4, 4])).status, "halved");
  assert.deepEqual(scoreHole(setup("match-play", 4), input([7, 3, 4, 6])).sideScores, [3, 4]);
  assert.equal(calculateGame(game, []).label, "All Square");
  const result = calculateGame(game, Array.from({ length: 10 }, (_, index) => input([4, 5], index + 1)));
  assert.equal(result.status, "complete");
  assert.equal(result.matches[0].holesRemaining, 8);
  assert.match(result.label, /10 Up/);
  // Extra historical holes cannot reverse a match after it was clinched.
  assert.equal(calculateGame(game, Array.from({ length: 18 }, (_, i) => input(i < 10 ? [4, 5] : [6, 3], i + 1))).holes.length, 10);
  assert.equal(calculateGame(game, Array.from({ length: 18 }, (_, i) => input([4, 4], i + 1))).label, "Tied");
});

test("Whole Tournament accumulates completed round match points", () => {
  const game = { ...setup("match-play"), scope: "tournament" as const, rounds: [{ id: "r1", holes: 1 }, { id: "r2", holes: 1 }] };
  const result = calculateGame(game, [input([4, 5]), input([4, 4], 1, { roundId: "r2" })]);
  assert.deepEqual(result.totals, { "team-1": 1.5, "team-2": 0.5 });
  assert.equal(result.status, "complete");
});

test("9 Point awards all four patterns with exactly nine points, independent of order", () => {
  for (const [scores, points] of [ [[4, 5, 6], [5, 3, 1]], [[4, 4, 6], [4, 4, 1]], [[4, 6, 6], [5, 2, 2]], [[4, 4, 4], [3, 3, 3]] ]) {
    const result = scoreHole(setup("9-point"), input(scores));
    assert.deepEqual(players.slice(0, 3).map(id => result.points[id]), points);
    assert.equal(Object.values(result.points).reduce((a, b) => a + b), 9);
  }
  assert.deepEqual(scoreHole(setup("9-point"), input([6, 4, 5])).points, { b: 5, c: 3, a: 1 });
});

test("Wolf rotation, partner win, lone win/loss/tie and configurable multiplier", () => {
  const game = setup("wolf", 4);
  assert.equal(wolfForHole(game, 5), "a");
  assert.equal(wolfForHole({ ...game, rotation: ["d", "c", "b", "a"] }, 2), "c");
  assert.deepEqual(scoreHole(game, input([4, 5, 6, 7], 1, { wolfChoice: { kind: "partner", partner: "b" } })).points, { a: 1, b: 1 });
  assert.deepEqual(scoreHole(game, input([4, 5, 6, 7], 1, { wolfChoice: { kind: "lone" } })).points, { a: 2 });
  assert.deepEqual(scoreHole({ ...game, loneWolfMultiplier: 3 }, input([4, 5, 6, 7], 1, { wolfChoice: { kind: "lone" } })).points, { a: 3 });
  assert.deepEqual(scoreHole(game, input([6, 4, 5, 5], 1, { wolfChoice: { kind: "lone" } })).points, { b: 1, c: 1, d: 1 });
  assert.deepEqual(scoreHole(game, input([4, 4, 5, 5], 1, { wolfChoice: { kind: "lone" } })).points, {});
  assert.throws(() => scoreHole(game, input([4, 5, 6, 7], 1, { wolfChoice: { kind: "partner", partner: "a" } })));
  for (const count of [3, 5]) assert.equal(scoreHole(setup("wolf", count), input(Array.from({ length: count }, (_, i) => 4 + i), 1, { wolfChoice: { kind: "lone" } })).points.a, 2);
});

test("Vegas orders digits, calculates differences, net values and cumulative totals", () => {
  assert.equal(vegasNumber([5, 4]), 45);
  assert.equal(vegasNumber([5, 7]), 57);
  assert.equal(vegasNumber([10, 4]), 410);
  assert.throws(() => vegasNumber([-1, 4]));
  const game = setup("vegas");
  const result = scoreHole(game, input([4, 5, 5, 7]));
  assert.deepEqual(result.sideScores, [45, 57]);
  assert.deepEqual(result.points, { "team-1": 12, "team-2": 0 });
  assert.deepEqual(calculateGame(game, [input([4, 5, 5, 7]), input([6, 7, 4, 5], 2)]).totals, { "team-1": 12, "team-2": 22 });
  assert.deepEqual(scoreHole({ ...game, handicap: true }, input([4, 5, 5, 7])).sideScores, [44, 34]);
});

test("Sixes rotates pairs, awards points only at segment end, and ties award zero", () => {
  const game = setup("round-robin");
  assert.deepEqual(sixesPairing(game, 1), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(sixesPairing(game, 7), [["a", "c"], ["b", "d"]]);
  assert.deepEqual(sixesPairing(game, 13), [["a", "d"], ["b", "c"]]);
  const holes = Array.from({ length: 18 }, (_, i) => input([3, 4, 5, 6], i + 1));
  assert.deepEqual(calculateGame(game, holes.slice(0, 5)).totals, { a: 0, b: 0, c: 0, d: 0 });
  assert.deepEqual(calculateGame(game, holes.slice(0, 6)).totals, { a: 1, b: 1, c: 0, d: 0 });
  const result = calculateGame(game, holes);
  assert.deepEqual(result.totals, { a: 3, b: 1, c: 1, d: 1 });
  assert.deepEqual(result.leaders, ["a"]);
  assert.equal(result.status, "complete");
  assert.deepEqual(calculateGame(game, Array.from({ length: 6 }, (_, i) => input([4, 4, 4, 4], i + 1))).totals, { a: 0, b: 0, c: 0, d: 0 });
  assert.ok(!recommendedGames(3, "round").some(game => game.id === "round-robin"));
  assert.ok(!recommendedGames(5, "tournament").some(game => game.id === "round-robin"));
});

test("Coin Flip deterministic 2v2, 1v3, 3v1, 2v3, 1v4, all-same and ties", () => {
  const cases: [number[], number, Record<string, number>][] = [
    [[3, 4, 5, 6], 2, { a: 2, b: 2 }], [[3, 4, 5, 6], 1, { a: 3 }],
    [[5, 3, 4, 4], 1, { b: 1, c: 1, d: 1 }], [[3, 4, 5, 6, 7], 2, { a: 3, b: 3 }],
    [[3, 4, 5, 6, 7], 1, { a: 4 }],
  ];
  for (const [scores, headsCount, expected] of cases) {
    const flips = Object.fromEntries(scores.map((_, i) => [players[i], i < headsCount ? "heads" : "tails"])) as HoleInput["flips"];
    assert.deepEqual(scoreHole(setup("coin-flip", scores.length), input(scores, 1, { flips })).points, expected);
  }
  const allSame = Object.fromEntries(players.slice(0, 4).map(id => [id, "heads"])) as HoleInput["flips"];
  assert.equal(scoreHole(setup("coin-flip"), input([3, 4, 5, 6], 1, { flips: allSame })).status, "no-split");
  assert.deepEqual(scoreHole(setup("coin-flip"), input([3, 4, 3, 5], 1, { flips: { a: "heads", b: "heads", c: "tails", d: "tails" } })).points, {});
  assert.throws(() => scoreHole(setup("coin-flip"), input([3, 4, 5, 6])));
});

test("Handicap selects provided net scores; never silently falls back to gross", () => {
  const game = { ...setup("match-play"), handicap: true };
  assert.equal(scoreHole(game, input([4, 4])).winner, 1);
  assert.throws(() => scoreHole(game, { ...input([4, 4]), scores: { a: { gross: 4 }, b: { gross: 4 } } }), /preview net/);
});

test("Setup and replay reject invalid counts, duplicate participants, gaps, invalid scores and teams", () => {
  assert.throws(() => validateSetup(setup("round-robin", 3)));
  assert.throws(() => validateSetup({ ...setup("match-play"), participants: ["a", "a"] }));
  assert.throws(() => validateSetup({ ...setup("vegas"), teams: [["a", "b"], ["b", "d"]] }));
  assert.throws(() => calculateGame(setup("match-play"), [input([4, 5], 2)]), /gaps/);
  assert.throws(() => calculateGame(setup("match-play"), [input([4, 5]), input([4, 5])]), /Duplicate/);
  assert.throws(() => scoreHole(setup("match-play"), input([NaN, 4])));
  assert.throws(() => scoreHole(setup("match-play"), input([4, 5], 19)));
});
