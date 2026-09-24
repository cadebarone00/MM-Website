import { test } from "node:test";
import assert from "node:assert/strict";
import {
  birdieChance,
  birdiesSoFar,
  featuredLine,
  parseBirdieSelection,
  simulateTotalBirdies,
  totalBirdiesMarket,
} from "./totalBirdiesFuture";
import type { HistoryRow, IndividualRound, PlayedScore } from "./lowIndividualFuture";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const par4 = { hole: 1, par: 4, yards: 400 };
const round = (number: number): IndividualRound => ({ round: number, holes: Array.from({ length: 18 }, (_, index) => ({ ...par4, hole: index + 1 })) });
const nothingPlayed: PlayedScore = () => null;

test("birdie chance blends the par pool and the yardage pool 50/50", () => {
  const history: HistoryRow[] = [
    { score: 3, par: 4, yards: 330 }, // par pool only: a birdie
    { score: 4, par: 4, yards: 330 }, // par pool only
    { score: 3, par: 3, yards: 405 }, // yardage pool only: a 3 on a 400-yard par 4 target is a birdie
    { score: 5, par: 5, yards: 405 }, // yardage pool only
  ];
  // Par pool: 1 of 2 birdies. Yardage pool: 1 of 2 (the 3). Average 0.5.
  assert.equal(birdieChance(history, par4), 0.5);
  assert.equal(birdieChance([], par4), null);
});

test("confirmed birdies are counted; eagles are not birdies", () => {
  const played: PlayedScore = (player, _round, hole) => (hole === 1 ? 3 : hole === 2 ? 2 : null);
  assert.equal(birdiesSoFar(["a", "b"], [round(1)], played), 2);
});

test("totals average close to the sum of each hole's birdie chance", () => {
  // 20% birdie rate, 2 players x 2 rounds x 18 holes = 72 holes -> mean 14.4.
  const history: HistoryRow[] = [...Array(4).fill({ score: 4, par: 4, yards: 400 }), { score: 3, par: 4, yards: 400 }];
  const totals = simulateTotalBirdies({ players: ["a", "b"], rounds: [round(1), round(2)], history: new Map([["a", history], ["b", history]]), played: nothingPlayed, random: seeded(9) });
  const mean = totals.reduce((sum, total) => sum + total, 0) / totals.length;
  assert.ok(Math.abs(mean - 14.4) < 0.2, String(mean));
});

test("the featured line is the half line nearest 50/50", () => {
  const line = featuredLine([10, 11, 12, 13, 14, 15]);
  assert.equal(line.line, 12.5);
  assert.equal(line.over, 0.5);
  assert.equal(line.under, 0.5);
});

test("selection keys carry the line the bet was placed at", () => {
  const market = totalBirdiesMarket(2027, { line: 41.5, over: 0.48, under: 0.52, mean: 41 });
  assert.equal(market.marketKey, "total-birdies:2027");
  assert.deepEqual(market.selections.map((s) => s.key), ["over:41.5", "under:41.5"]);
  assert.deepEqual(parseBirdieSelection("under:41.5"), { side: "under", line: 41.5 });
  assert.equal(parseBirdieSelection("sideways:1"), null);
});
