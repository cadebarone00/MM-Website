import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateGame, scoreHole, DEFAULT_SCORING, editGameSettings, initialGameSettings, ninePointWarnings, startGameSettings, validateScoring, type GameSetup, type HoleInput, type ScoringConfigMap, type ScoringGameId, type ScoringSettings } from "./index";

const players = ["a", "b", "c", "d"];
function setup<K extends ScoringGameId>(game: K, custom: Partial<ScoringConfigMap[K]> = {}, holes = game === "round-robin" ? 18 : 2): GameSetup {
  return { id: game, scope: "round", participants: players.slice(0, game === "match-play" ? 2 : game === "9-point" ? 3 : 4), handicap: false, rounds: [{ id: "r", holes }], scoring: { game, values: { ...DEFAULT_SCORING[game], ...custom } } as ScoringSettings };
}
function input(scores: number[], hole = 1, extras: Partial<HoleInput> = {}): HoleInput {
  return { roundId: "r", hole, par: 4, scores: Object.fromEntries(scores.map((gross, index) => [players[index], { gross, net: gross - index }])), wolfChoice: { kind: "lone" }, flips: { a: "heads", b: "heads", c: "tails", d: "tails" }, ...extras };
}

test("explicit Standard configs exactly reproduce unconfigured v1 hole results and replay", () => {
  for (const game of ["match-play", "9-point", "wolf", "vegas", "round-robin", "coin-flip"] as const) {
    const configured = setup(game);
    const legacy = { ...configured, scoring: undefined };
    for (const scores of [[3, 4, 5, 6], [4, 4, 4, 4], [5, 3, 3, 6]]) {
      const first = input(scores);
      assert.deepEqual(scoreHole(configured, first), scoreHole(legacy, first), game);
      assert.deepEqual(calculateGame(configured, [first, input(scores, 2)]), calculateGame(legacy, [first, input(scores, 2)]), game);
    }
  }
});

test("Match Play changes hole and completion awards while match rules stay fixed", () => {
  const game = setup("match-play", { holeWin: 3, holeTie: 2, matchWin: 7, matchTie: 4 });
  assert.deepEqual(calculateGame(game, [input([3, 4]), input([4, 4], 2)]).totals, { "team-1": 12, "team-2": 2 });
  assert.deepEqual(calculateGame(game, [input([4, 4]), input([4, 4], 2)]).totals, { "team-1": 8, "team-2": 8 });
});

test("Match Play playoff continues tied rounds until the first winning extra hole", () => {
  const game = setup("match-play", { playoff: true }, 1);
  assert.equal(calculateGame(game, [input([4, 4])]).status, "in-progress");
  assert.match(calculateGame(game, [input([4, 4])]).label, /Playoff/);
  const won = calculateGame(game, [input([4, 4]), input([4, 4], 2), input([3, 4], 3), input([5, 3], 4)]);
  assert.equal(won.status, "complete");
  assert.equal(won.holes.length, 3);
  assert.deepEqual(won.totals, { "team-1": 1, "team-2": 0 });
  assert.throws(() => scoreHole(setup("match-play", {}, 1), input([4, 4], 2)), /outside/);
});

test("9 Point custom allocations for every pattern warn but do not enforce nine", () => {
  const values = { different1: 10, different2: 7, different3: 2, lowTie1: 8, lowTie2: 8, lowTie3: 2, highTie1: 9, highTie2: 4, highTie3: 4, allTie1: 6, allTie2: 6, allTie3: 6 };
  const game = setup("9-point", values);
  for (const [scores, points] of [[[3, 4, 5], [10, 7, 2]], [[3, 3, 5], [8, 8, 2]], [[3, 5, 5], [9, 4, 4]], [[4, 4, 4], [6, 6, 6]]]) {
    assert.deepEqual(Object.values(scoreHole(game, input(scores)).points), points);
  }
  assert.equal(ninePointWarnings({ ...DEFAULT_SCORING["9-point"], ...values }).length, 4);
  assert.deepEqual(ninePointWarnings(DEFAULT_SCORING["9-point"]), []);
});

test("Wolf custom partner, lone, loss, tie, multiplier and gross bonuses", () => {
  const game = setup("wolf", { partnerWin: 3, loneWin: 4, loneLoss: 5, tie: 2, loneMultiplier: 3, birdieBonus: 7, eagleBonus: 11 });
  assert.deepEqual(scoreHole(game, input([3, 5, 6, 7], 1, { wolfChoice: { kind: "partner", partner: "b" } })).points, { a: 10, b: 3 });
  assert.deepEqual(scoreHole(game, input([2, 5, 6, 7])).points, { a: 23 });
  assert.deepEqual(scoreHole(game, input([6, 4, 5, 5])).points, { b: 5, c: 5, d: 5 });
  assert.deepEqual(scoreHole(game, input([4, 4, 5, 5])).points, { a: 2, b: 2, c: 2, d: 2 });
});

test("Blind Wolf is opt-in and uses its configured award", () => {
  const hole = input([3, 4, 5, 6], 1, { wolfChoice: { kind: "blind" } });
  assert.throws(() => scoreHole(setup("wolf"), hole), /disabled/);
  assert.deepEqual(scoreHole(setup("wolf", { blindEnabled: true, blindWin: 9 }), hole).points, { a: 9 });
});

test("Wolf carries consecutive ties, clears carry after a winner, and restarts per round", () => {
  const game = setup("wolf", { carryover: true }, 3);
  const holes = [input([4, 4, 5, 5]), input([5, 3, 6, 7], 2), input([5, 6, 3, 7], 3)];
  assert.deepEqual(calculateGame(game, holes).totals, { a: 0, b: 4, c: 2, d: 0 });
  const tournament = { ...game, scope: "tournament" as const, rounds: [{ id: "r", holes: 1 }, { id: "r2", holes: 1 }] };
  assert.equal(calculateGame(tournament, [holes[0], input([3, 4, 5, 6], 1, { roundId: "r2" })]).totals.a, 2);
});

test("Vegas multiplier, cap and negative points affect awards", () => {
  const game = setup("vegas", { multiplier: 3, capEnabled: true, cap: 20, negativePoints: true });
  assert.deepEqual(scoreHole(game, input([4, 5, 5, 7])).points, { "team-1": 20, "team-2": -20 });
  assert.deepEqual(scoreHole(setup("vegas", { multiplier: 2 }), input([4, 5, 5, 7])).points, { "team-1": 24, "team-2": 0 });
});

test("Vegas birdie/eagle flips reverse the opposing digits independently", () => {
  assert.deepEqual(scoreHole(setup("vegas", { birdieFlip: true }), input([3, 5, 4, 6])).sideScores, [35, 64]);
  assert.deepEqual(scoreHole(setup("vegas", { eagleFlip: true }), input([2, 5, 4, 6])).sideScores, [25, 64]);
  assert.deepEqual(scoreHole(setup("vegas", { birdieFlip: true }), input([2, 5, 4, 6])).sideScores, [25, 46]);
  assert.deepEqual(scoreHole(setup("vegas", { birdieFlip: true }), input([3, 5, 3, 6])).sideScores, [35, 36]);
});

test("Sixes custom hole, segment, tie and overall awards retain pairings", () => {
  const game = setup("round-robin", { holeWin: 2, holeTie: 3, segmentWin: 4, segmentTie: 5, roundBonus: 7 });
  const won = calculateGame(game, Array.from({ length: 18 }, (_, i) => input([3, 4, 5, 6], i + 1)));
  assert.deepEqual(won.totals, { a: 55, b: 16, c: 16, d: 16 });
  const tied = calculateGame(game, Array.from({ length: 6 }, (_, i) => input([4, 4, 4, 4], i + 1)));
  assert.deepEqual(tied.totals, { a: 23, b: 23, c: 23, d: 23 });
});

test("Coin Flip custom opponent, solo and tie awards", () => {
  const game = setup("coin-flip", { opponentPoints: 3, soloMultiplier: 2, tie: 4 });
  assert.deepEqual(scoreHole(game, input([3, 4, 5, 6])).points, { a: 6, b: 6 });
  assert.deepEqual(scoreHole(game, input([3, 4, 5, 6], 1, { flips: { a: "heads", b: "tails", c: "tails", d: "tails" } })).points, { a: 18 });
  assert.deepEqual(scoreHole(game, input([3, 4, 3, 5])).points, { a: 4, b: 4, c: 4, d: 4 });
});

test("Coin Flip no-split carries only when enabled, retaining ties until a win", () => {
  const holes = [input([3, 4, 5, 6], 1, { flips: { a: "heads", b: "heads", c: "heads", d: "heads" } }), input([3, 4, 3, 6], 2), input([3, 4, 5, 6], 3)];
  assert.equal(calculateGame(setup("coin-flip", { noSplit: "carryover" }, 3), holes).totals.a, 4);
  assert.equal(calculateGame(setup("coin-flip", {}, 3), holes).totals.a, 2);
});

test("Skins Standard, custom values, tie carryover, bonuses and carryover off", () => {
  assert.equal(scoreHole(setup("skins"), input([3, 4, 5, 6])).points.a, 1);
  const game = setup("skins", { skinValue: 3, birdieBonus: 2, eagleBonus: 5 });
  const holes = [input([3, 3, 4, 5]), input([2, 4, 5, 6], 2)];
  assert.equal(calculateGame(game, holes).totals.a, 11);
  assert.equal(calculateGame(setup("skins", { ...game.scoring!.values, carryover: false }), holes).totals.a, 8);
});

test("config handicap overrides legacy setup flag for every game", () => {
  for (const game of Object.keys(DEFAULT_SCORING) as ScoringGameId[]) {
    const configured = setup(game, { handicap: true });
    assert.notDeepEqual(scoreHole(configured, input([4, 4, 4, 4])), scoreHole(setup(game), input([4, 4, 4, 4])), game);
    assert.throws(() => scoreHole(configured, { ...input([4, 4, 4, 4]), scores: { a: { gross: 4 } } }), /preview net/);
  }
});

test("settings reset to Standard, preserve other games, and reject all edits after started", () => {
  for (const game of Object.keys(DEFAULT_SCORING) as ScoringGameId[]) {
    const original = initialGameSettings(game);
    const custom = editGameSettings(original, "custom", { ...original.scoring, values: { ...original.scoring.values, handicap: true } } as ScoringSettings);
    assert.equal(custom.scoring.values.handicap, true);
    assert.deepEqual(editGameSettings(custom, "standard"), original);
    assert.deepEqual(initialGameSettings(game), original);
    const locked = startGameSettings(custom);
    assert.equal(editGameSettings(locked, "standard"), locked);
    assert.equal(editGameSettings(locked, "custom", original.scoring), locked);
    assert.equal(locked.scoring.values.handicap, true);
    assert.equal(locked.preset, "custom");
  }
});

test("invalid numeric settings and mismatched configs are rejected", () => {
  for (const value of [NaN, Infinity, -1, 10001]) assert.throws(() => validateScoring({ game: "skins", values: { ...DEFAULT_SCORING.skins, skinValue: value } }));
  assert.throws(() => scoreHole({ ...setup("skins"), scoring: initialGameSettings("wolf").scoring }, input([3, 4, 5, 6])), /match the game/);
});

test("handicap bonuses use gross against par, and reject missing gross rather than guessing", () => {
  const game = setup("skins", { handicap: true, birdieBonus: 7, eagleBonus: 11 });
  const hole = input([3, 5, 6, 7]);
  assert.equal(scoreHole(game, hole).points.a, 8);
  const missingGross = { ...hole, scores: { ...hole.scores, a: { gross: NaN, net: 3 } } };
  assert.throws(() => scoreHole(game, missingGross), /gross scores/);
  const birdie = setup("vegas", { handicap: true, birdieFlip: true });
  assert.deepEqual(scoreHole(birdie, input([3, 5, 6, 7])).sideScores, [34, 44]);
});
