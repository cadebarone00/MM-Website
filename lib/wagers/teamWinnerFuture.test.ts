import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidedResult,
  fairAmericanOdds,
  missingOdds,
  pairKey,
  possibleMatchups,
  randomPairings,
  simulateTeamWinner,
  teamPoints,
  teamWinnerMarket,
  type FutureRound,
  type Outcome,
  type Roster,
} from "./teamWinnerFuture";

const roster: Roster = { maroon: ["m1", "m2", "m3", "m4"], white: ["w1", "w2", "w3", "w4"] };

/** Deterministic PRNG so simulations are repeatable in tests. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function fullTable(rounds: FutureRound[], outcome: Outcome): Map<string, Outcome> {
  return new Map(rounds.flatMap((round) => possibleMatchups(round, roster).map((matchup) => [matchup.key, outcome] as const)));
}

test("an unpaired Fourball round needs every partnership against every partnership", () => {
  const round: FutureRound = { round: 1, format: "Fourball", courseKey: "c1", matches: null };
  // 4 players -> 6 partnerships per team -> 36 matchups.
  assert.equal(possibleMatchups(round, roster).length, 36);
  const singles: FutureRound = { round: 2, format: "Singles", courseKey: "c1", matches: null };
  assert.equal(possibleMatchups(singles, roster).length, 16);
});

test("pair keys ignore partner order", () => {
  assert.equal(pairKey("Fourball", "c1", ["m2", "m1"], ["w1", "w3"]), pairKey("Fourball", "c1", ["m1", "m2"], ["w3", "w1"]));
});

test("random pairings use every player exactly once", () => {
  const round: FutureRound = { round: 1, format: "Fourball", courseKey: "c1", matches: null };
  const pairings = randomPairings(round, roster, seeded(7));
  assert.equal(pairings.length, 2);
  assert.deepEqual(pairings.flatMap((p) => p.maroon).sort(), roster.maroon);
  assert.deepEqual(pairings.flatMap((p) => p.white).sort(), roster.white);
});

test("banked points and remaining points count ties as half", () => {
  const rounds: FutureRound[] = [
    {
      round: 1,
      format: "Singles",
      courseKey: "c1",
      matches: [
        { maroon: ["m1"], white: ["w1"], result: "maroon", odds: null },
        { maroon: ["m2"], white: ["w2"], result: "tie", odds: null },
        { maroon: ["m3"], white: ["w3"], result: null, odds: { maroon: 0.5, tie: 0.1, white: 0.4 } },
        { maroon: ["m4"], white: ["w4"], result: "white", odds: null },
      ],
    },
    { round: 2, format: "Fourball", courseKey: "c1", matches: null },
  ];
  assert.deepEqual(teamPoints(rounds, roster), { maroon: 1.5, white: 1.5, remaining: 3 });
});

test("the market is decided once a team can't be caught", () => {
  assert.equal(decidedResult({ maroon: 5, white: 1, remaining: 3 }), "maroon");
  assert.equal(decidedResult({ maroon: 4, white: 1, remaining: 3 }), null);
  assert.equal(decidedResult({ maroon: 1, white: 5, remaining: 3 }), "white");
  assert.equal(decidedResult({ maroon: 3, white: 3, remaining: 0 }), "tie");
});

test("missing odds are reported for unpaired rounds and unpriced paired matches", () => {
  const rounds: FutureRound[] = [
    { round: 1, format: "Singles", courseKey: "c1", matches: [{ maroon: ["m1"], white: ["w1"], result: null, odds: null }] },
    { round: 2, format: "Singles", courseKey: "c2", matches: null },
  ];
  assert.equal(missingOdds(rounds, roster, new Map()).length, 1 + 16);
  const table = fullTable(rounds, { maroon: 0.4, tie: 0.2, white: 0.4 });
  table.set(pairKey("Singles", "c1", ["m1"], ["w1"]), { maroon: 0.4, tie: 0.2, white: 0.4 });
  assert.deepEqual(missingOdds(rounds, roster, table), []);
});

test("a certain match outcome gives a certain team result", () => {
  const rounds: FutureRound[] = [{ round: 1, format: "Singles", courseKey: "c1", matches: null }];
  const outcome = simulateTeamWinner({ rounds, roster, pairTable: fullTable(rounds, { maroon: 1, tie: 0, white: 0 }), simulations: 200, random: seeded(1) });
  assert.deepEqual(outcome, { maroon: 1, tie: 0, white: 0 });
});

test("evenly matched teams split symmetrically, with a real chance of a tie", () => {
  const rounds: FutureRound[] = [
    { round: 1, format: "Fourball", courseKey: "c1", matches: null },
    { round: 2, format: "Singles", courseKey: "c1", matches: null },
  ];
  const outcome = simulateTeamWinner({ rounds, roster, pairTable: fullTable(rounds, { maroon: 0.45, tie: 0.1, white: 0.45 }), random: seeded(42) });
  assert.ok(Math.abs(outcome.maroon - outcome.white) < 0.03, JSON.stringify(outcome));
  assert.ok(outcome.tie > 0.05, JSON.stringify(outcome));
  assert.ok(Math.abs(outcome.maroon + outcome.tie + outcome.white - 1) < 1e-9);
});

test("a banked lead shifts the odds toward the leader", () => {
  const rounds: FutureRound[] = [
    {
      round: 1,
      format: "Singles",
      courseKey: "c1",
      matches: roster.maroon.map((player, index) => ({ maroon: [player], white: [roster.white[index]], result: "maroon" as const, odds: null })),
    },
    { round: 2, format: "Singles", courseKey: "c1", matches: null },
  ];
  const outcome = simulateTeamWinner({ rounds, roster, pairTable: fullTable(rounds, { maroon: 0.45, tie: 0.1, white: 0.45 }), random: seeded(3) });
  // Maroon leads 4-0 with 4 points left: White can at best tie.
  assert.equal(outcome.white, 0);
  assert.ok(outcome.maroon > 0.9);
});

test("fair odds and the market drop certain or impossible selections", () => {
  assert.equal(fairAmericanOdds(0.5), -100);
  assert.equal(fairAmericanOdds(0.2), 400);
  assert.equal(fairAmericanOdds(0.8), -400);
  assert.equal(fairAmericanOdds(0), null);
  const market = teamWinnerMarket(2027, { maroon: -150, tie: null, white: 130 });
  assert.equal(market.marketKey, "team-winner:2027");
  assert.deepEqual(market.selections.map((s) => s.key), ["maroon", "white"]);
});
