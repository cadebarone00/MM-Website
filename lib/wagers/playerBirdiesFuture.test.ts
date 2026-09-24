import { test } from "node:test";
import assert from "node:assert/strict";
import {
  birdieLines,
  expectedBirdies,
  featuredLineIndex,
  parsePlayerBirdieSelection,
  playerBirdiesMarket,
  simulatePlayerBirdies,
} from "./playerBirdiesFuture";
import type { HistoryRow, IndividualRound, PlayedScore } from "./lowIndividualFuture";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const round = (number: number): IndividualRound => ({ round: number, holes: Array.from({ length: 18 }, (_, index) => ({ hole: index + 1, par: 4, yards: 400 })) });
const nothingPlayed: PlayedScore = () => null;

test("a player's simulated total averages their per-hole birdie chance times holes left", () => {
  // 20% birdie rate x 72 holes = 14.4.
  const history: HistoryRow[] = [...Array(4).fill({ score: 4, par: 4, yards: 400 }), { score: 3, par: 4, yards: 400 }];
  const histogram = simulatePlayerBirdies({ player: "a", rounds: [1, 2, 3, 4].map(round), history, played: nothingPlayed, random: seeded(5) });
  assert.equal(histogram.reduce((sum, count) => sum + count, 0), 10_000);
  assert.ok(Math.abs(expectedBirdies(histogram) - 14.4) < 0.2, String(expectedBirdies(histogram)));
});

test("confirmed birdies are banked", () => {
  const played: PlayedScore = (_player, roundNumber, hole) => (roundNumber === 1 ? (hole <= 3 ? 3 : 4) : null);
  const histogram = simulatePlayerBirdies({ player: "a", rounds: [round(1), round(2)], history: [{ score: 4, par: 4, yards: 400 }], played, simulations: 100, random: seeded(1) });
  // Never birdies the unplayed round, so every run ends on exactly the 3 banked.
  assert.equal(histogram[3], 100);
});

test("alternate lines stop before either side gets too unlikely, and the slider starts nearest 50/50", () => {
  // Totals 0..10, 100 runs each.
  const lines = birdieLines(Array(11).fill(100));
  assert.ok(lines.every((line) => line.over >= 0.03 && line.under >= 0.03));
  // 10.5 would leave Over at 0%, so it's dropped.
  assert.deepEqual(lines.map((line) => line.line), [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5]);
  const featured = lines[featuredLineIndex(lines)];
  assert.equal(featured.line, 4.5); // under = 5/11, the closest to half
  assert.ok(featured.overOdds !== null && featured.underOdds !== null);
});

test("every line is its own selection and keys round-trip", () => {
  const lines = birdieLines(Array(11).fill(100));
  const market = playerBirdiesMarket(2027, [{ player: "cam-latto", birdiesSoFar: 0, expected: 5, featured: featuredLineIndex(lines), lines }], (player) => player);
  assert.equal(market.marketKey, "player-birdies:2027");
  assert.equal(market.selections.length, lines.length * 2);
  assert.ok(market.selections.some((selection) => selection.key === "cam-latto:over:4.5"));
  assert.deepEqual(parsePlayerBirdieSelection("cam-latto:under:12.5"), { player: "cam-latto", side: "under", line: 12.5 });
  assert.equal(parsePlayerBirdieSelection("cam-latto:sideways:1"), null);
});
