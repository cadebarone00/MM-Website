import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentStandings,
  holePools,
  lowIndividualMarket,
  lowIndividualOdds,
  missingHistory,
  simulateLowIndividual,
  type HistoryRow,
  type IndividualRound,
  type PlayedScore,
} from "./lowIndividualFuture";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const round = (number: number): IndividualRound => ({
  round: number,
  holes: Array.from({ length: 18 }, (_, index) => ({ hole: index + 1, par: 4, yards: 400 })),
});

/** A player who always makes `score` on a 400-yard par 4. */
const steady = (score: number): HistoryRow[] => Array.from({ length: 20 }, () => ({ score, par: 4, yards: 400 }));
const nothingPlayed: PlayedScore = () => null;

test("hole pools use same-par holes and the neighbouring 10-yard buckets", () => {
  const history: HistoryRow[] = [
    { score: 3, par: 4, yards: 400 },
    { score: 5, par: 5, yards: 405 },
    { score: 6, par: 5, yards: 520 },
    { score: 4, par: 4, yards: 330 },
  ];
  const pools = holePools(history, { hole: 1, par: 4, yards: 402 });
  assert.deepEqual(pools.one.sort(), [3, 4]);
  assert.deepEqual(pools.two.sort(), [3, 5]);
});

test("the better player wins every simulation when scoring is certain", () => {
  const history = new Map([["a", steady(4)], ["b", steady(5)]]);
  const result = simulateLowIndividual({ players: ["a", "b"], rounds: [round(1), round(2)], history, played: nothingPlayed, simulations: 100, random: seeded(1) });
  assert.deepEqual(result, { a: 1, b: 0 });
});

test("an exact tie splits the win share dead heat", () => {
  const history = new Map([["a", steady(4)], ["b", steady(4)], ["c", steady(6)]]);
  const result = simulateLowIndividual({ players: ["a", "b", "c"], rounds: [round(1)], history, played: nothingPlayed, simulations: 50, random: seeded(2) });
  assert.deepEqual(result, { a: 0.5, b: 0.5, c: 0 });
});

test("confirmed holes are fixed and only unplayed holes are simulated", () => {
  // Both average 4.5 a hole, but "b" has already banked 18 holes of 3s.
  const mixed: HistoryRow[] = [...steady(4), ...steady(5)];
  const history = new Map([["a", mixed], ["b", mixed]]);
  const played: PlayedScore = (player, roundNumber) => (player === "b" && roundNumber === 1 ? 3 : null);
  const result = simulateLowIndividual({ players: ["a", "b"], rounds: [round(1), round(2)], history, played, random: seeded(3) });
  assert.equal(result.b, 1);
});

test("win shares always sum to 1", () => {
  const mixed = (low: number): HistoryRow[] => [...steady(low), ...steady(low + 1), ...steady(low + 2)];
  const history = new Map([["a", mixed(3)], ["b", mixed(3)], ["c", mixed(4)]]);
  const result = simulateLowIndividual({ players: ["a", "b", "c"], rounds: [round(1)], history, played: nothingPlayed, random: seeded(4) });
  const total = Object.values(result).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, String(total));
  assert.ok(result.a > result.c && result.b > result.c, JSON.stringify(result));
});

test("a player without any usable history is reported, not guessed", () => {
  const history = new Map([["a", steady(4)], ["rookie", [{ score: 5, par: 3, yards: 180 }]]]);
  const missing = missingHistory(["a", "rookie"], [round(1)], history, nothingPlayed);
  assert.equal(missing.length, 18);
  assert.ok(missing.every((entry) => entry.startsWith("rookie:")));
});

test("standings rank by score to par on confirmed holes", () => {
  const played: PlayedScore = (player, _round, hole) => (hole > 2 ? null : player === "a" ? 5 : 3);
  const standings = currentStandings(["a", "b"], [round(1)], played);
  assert.deepEqual(standings.map((s) => [s.player, s.strokes, s.toPar, s.holesPlayed]), [["b", 6, -2, 2], ["a", 10, 2, 2]]);
});

test("the market lists every player with a price and drops certain outcomes", () => {
  const odds = lowIndividualOdds({ a: 0.25, b: 0.75, c: 0 });
  assert.deepEqual(odds, { a: 300, b: -300, c: null });
  const market = lowIndividualMarket(2027, odds, (player) => player.toUpperCase());
  assert.equal(market.marketKey, "low-individual:2027");
  assert.deepEqual(market.selections.map((s) => [s.key, s.odds]), [["a", 300], ["b", -300]]);
  assert.equal(market.selections[0].label, "A has the lowest individual total in 2027");
});
