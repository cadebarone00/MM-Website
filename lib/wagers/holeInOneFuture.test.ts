import { test } from "node:test";
import assert from "node:assert/strict";
import { holeInOneMarket, holeInOneProbability, teeShotsRemaining, type AceRound } from "./holeInOneFuture";

const players = ["a", "b", "c", "d"];
const nonePlayed = () => false;

test("every player tees off in Singles/Fourball; Foursome counts one shot per pair", () => {
  const rounds: AceRound[] = [
    { round: 1, format: "Singles", par3Holes: [3, 7, 12, 16] },
    { round: 2, format: "Foursome", par3Holes: [5, 14] },
  ];
  // 4 par 3s x 4 players + 2 par 3s x 2 sides.
  assert.equal(teeShotsRemaining(rounds, players, nonePlayed), 16 + 4);
});

test("played holes no longer count", () => {
  const rounds: AceRound[] = [{ round: 1, format: "Fourball", par3Holes: [3, 7] }];
  const played = (player: string, _round: number, hole: number) => hole === 3 && player !== "d";
  assert.equal(teeShotsRemaining(rounds, players, played), 1 + 4);
});

test("probability of at least one ace", () => {
  assert.equal(holeInOneProbability(0), 0);
  assert.ok(Math.abs(holeInOneProbability(1) - 1 / 5_000) < 1e-12);
  // 288 tee shots (12 players x 4 par 3s x 6 rounds) is roughly a 5.6% chance.
  assert.ok(Math.abs(holeInOneProbability(288) - 0.056) < 0.0005, String(holeInOneProbability(288)));
});

test("the market prices Yes and No and drops a certain outcome", () => {
  const market = holeInOneMarket(2027, 0.2);
  assert.equal(market.marketKey, "hole-in-one:2027");
  assert.deepEqual(market.selections.map((s) => [s.key, s.odds]), [["yes", 400], ["no", -400]]);
  assert.deepEqual(holeInOneMarket(2027, 0).selections, []);
});
