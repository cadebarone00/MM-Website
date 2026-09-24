import test from "node:test";
import assert from "node:assert/strict";
import { calculateRoundPayouts, calculateSkinsPayouts } from "./payout";
import type { SkinWin } from "./calculate";
import { skinsScoreLabel } from "./scoreLabel";
import { pastTournaments } from "@/lib/data";
import { tournamentRoundSequence } from "@/lib/data/tournamentRoundSequence";
import { isIndividualScoreFormat } from "@/lib/handicap/archiveIndex";

const win = (player: string, round: number, hole: number): SkinWin => ({ player, round, hole, course: "Course", score: 3, par: 4 });

test("$200 is divided separately for each round, then added to player earnings", () => {
  const result = calculateRoundPayouts(["cam", "cade", "joe"], [
    win("cam", 1, 1), win("cam", 1, 2), win("cade", 1, 3), win("cade", 1, 4),
    win("cade", 3, 1), win("joe", 2, 1),
  ], [1, 3]);
  assert.deepEqual(result.earnings, { cam: 10000, cade: 30000, joe: 0 });
  assert.deepEqual(result.rounds.map((r) => r.perSkinCents), [5000, 20000]);
});

test("rounding distributes exactly $200 and is deterministic regardless of input order", () => {
  const shares = calculateSkinsPayouts({ cam: 1, cade: 1, joe: 1, zero: 0 }, 20000)!;
  assert.equal(Object.values(shares).reduce((sum, cents) => sum + cents, 0), 20000);
  assert.equal(shares.zero, 0);
  assert.deepEqual(shares, calculateSkinsPayouts({ zero: 0, joe: 1, cade: 1, cam: 1 }, 20000));
});

test("a round with no winning holes has no earnings or carryover", () => {
  const result = calculateRoundPayouts(["cam"], [win("cam", 3, 2)], [1, 3]);
  assert.equal(result.rounds[0].perSkinCents, null);
  assert.equal(result.earnings.cam, 20000);
});

test("2026 has six individual-ball pots totaling $1,200, funded by twelve $100 entries", () => {
  const tournament = pastTournaments.find((t) => t.year === 2026)!;
  const rounds = tournamentRoundSequence(tournament).flatMap((r, i) => isIndividualScoreFormat(r.format) ? [i + 1] : []);
  assert.deepEqual(rounds, [1, 3, 4, 5, 7, 8]);
  assert.equal(calculateRoundPayouts([], [], rounds).rounds.reduce((sum, r) => sum + r.potCents, 0), 120000);
});

test("winning scores use the correct word, including par and unknown par", () => {
  assert.equal(skinsScoreLabel(4, 4), "Par");
  assert.equal(skinsScoreLabel(3, 4), "Birdie");
  assert.equal(skinsScoreLabel(2, 4), "Eagle");
  assert.equal(skinsScoreLabel(5, 4), "Bogey");
  assert.equal(skinsScoreLabel(6, 4), "Double bogey");
  assert.equal(skinsScoreLabel(3, null), "Par unavailable");
});
