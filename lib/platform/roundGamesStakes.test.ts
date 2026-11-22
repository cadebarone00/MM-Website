import { test } from "node:test";
import assert from "node:assert/strict";
import { courseHandicap, pairwiseMoney, scoreGame, stakeUnit, type GameConfig } from "./roundGames.ts";

// --- Play a round, round 2 (owner request 2026-11-21): stakes, eagles triple, carryovers, allowance, Nassau presses ---

const par = Array.from({ length: 18 }, () => 4);
const course = { par, rating: null, slope: null };
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, handicap: null }));
const range: [number, number] = [0, 18];
/** Rows of 18 strokes, all `base`, with some holes changed: { [player]: { [hole]: strokes } }. */
function card(n: number, changes: Record<number, Record<number, number>> = {}, base = 4) {
  return Array.from({ length: n }, (_, p) => par.map((_, h) => changes[p]?.[h] ?? base));
}
const money = (result: ReturnType<typeof scoreGame>) => Object.fromEntries(result.standings.map((s) => [s.label, s.money]));
const config = (part: Partial<GameConfig> & Pick<GameConfig, "id">): GameConfig => ({ net: false, birdiesDouble: false, ...part });

test("money always adds up to zero, settled between every pair", () => {
  // P0 is 2 ahead of P1 and 3 ahead of P2 → 5 × $5; P1: −2 + 1; P2: −3 − 1.
  assert.deepEqual(pairwiseMoney([3, 1, 0], 5), [25, -5, -20]);
  assert.equal(pairwiseMoney([7, 2, 2, 9], 2.5).reduce((a, b) => a + b, 0), 0);
});

test("skins: $ per skin, birdies double and eagles triple", () => {
  // Hole 1: P0 birdie (3) wins 1 skin ×2. Hole 2: P1 eagle (2) wins 1 skin ×3. Everything else tied → carries.
  const strokes = card(3, { 0: { 0: 3 }, 1: { 1: 2 } });
  const result = scoreGame(config({ id: "skins", birdiesDouble: true, eaglesTriple: true, stake: 5 }), players(3), course, range, strokes);
  assert.deepEqual(result.standings.map((s) => [s.label, s.value]), [["P1", "3 skins"], ["P0", "2 skins"], ["P2", "0 skins"]]);
  assert.deepEqual(money(result), { P1: 20, P0: 5, P2: -25 });
  assert.equal(result.note, "16 skins carrying over");
});

test("skins without carryovers: a tied hole's skin is dead", () => {
  const strokes = card(2, { 0: { 0: 4, 1: 3 } }); // hole 1 tied, hole 2 P0 wins
  const on = scoreGame(config({ id: "skins" }), players(2), course, range, strokes);
  const off = scoreGame(config({ id: "skins", carryovers: false }), players(2), course, range, strokes);
  assert.equal(on.standings[0].value, "2 skins");
  assert.equal(off.standings[0].value, "1 skin");
  assert.equal(off.note, undefined);
});

test("stroke play: $ per stroke between every pair; no stake = no money", () => {
  const strokes = card(3, { 0: { 0: 3 }, 2: { 0: 6 } }); // totals 71, 72, 74
  assert.deepEqual(money(scoreGame(config({ id: "stroke", stake: 1 }), players(3), course, range, strokes)), { P0: 4, P1: 1, P2: -5 });
  assert.equal(scoreGame(config({ id: "stroke" }), players(3), course, range, strokes).standings[0].money, undefined);
});

test("points games: each point is worth the stake as it stands (Sixes)", () => {
  const strokes = card(4, { 0: { 0: 3 } }); // A+B beat C+D on hole 1
  const result = scoreGame(config({ id: "sixes", stake: 2 }), players(4), course, range, strokes);
  assert.deepEqual(money(result), { P0: 4, P1: 4, P2: -4, P3: -4 });
});

test("match play: the stake goes to each winner from each loser", () => {
  const strokes = card(2, { 0: { 0: 3 } });
  const result = scoreGame(config({ id: "match", stake: 10 }), players(2), course, range, strokes);
  assert.deepEqual(money(result), { P0: 10, P1: -10 });
});

test("nassau: separate front / back / overall stakes, and a press when 2 down on a nine", () => {
  // P1 wins holes 1 and 2 (P0 2 down → press from hole 3); P0 wins holes 3, 4, 5: the press goes 2 up after hole 4, so P1
  // (now 2 down in it) gets a press from hole 5. P0 wins the front 1 UP, press 1 by 3 and press 2 by 1.
  const strokes = card(2, { 1: { 0: 3, 1: 3 }, 0: { 2: 3, 3: 3, 4: 3 } });
  const plain = scoreGame(config({ id: "nassau", nassauStakes: [5, 5, 10] }), players(2), course, range, strokes);
  assert.deepEqual(money(plain), { Front: undefined, Back: undefined, Overall: undefined, P0: 15, P1: -15 }, "front $5 + overall $10 to P0");
  const pressed = scoreGame(config({ id: "nassau", nassauStakes: [5, 5, 10], autoPress: true }), players(2), course, range, strokes);
  assert.match(pressed.standings[0].value, /2 presses$/);
  assert.equal(money(pressed).P0, 25, "plus $5 for each press");
});

test("net allowance scales the course handicap; the setup's stake label fits the game", () => {
  assert.equal(courseHandicap(20, course, range), 20);
  assert.equal(courseHandicap(20, course, range, 80), 16);
  assert.equal(courseHandicap(20, course, [0, 9], 90), 9);
  assert.deepEqual(["skins", "stroke", "nassau", "wolf", "snake"].map((id) => stakeUnit(id as GameConfig["id"])), ["skin", "stroke", "match", "point", "player"]);
});

test("mid-round doubles: a doubled hole counts twice (and stacks with birdies), only when the game allows doubles", () => {
  const strokes = card(3, { 0: { 0: 3 }, 1: { 1: 3 } }); // P0 birdies hole 1, P1 birdies hole 2
  const inputs = [{ doubled: true }, {}];
  const skins = scoreGame(config({ id: "skins", birdiesDouble: true, doubles: true, stake: 1 }), players(3), course, range, strokes, inputs);
  assert.deepEqual(skins.standings.map((s) => [s.label, s.value]), [["P0", "4 skins"], ["P1", "2 skins"], ["P2", "0 skins"]]);
  const off = scoreGame(config({ id: "skins", birdiesDouble: true, stake: 1 }), players(3), course, range, strokes, inputs);
  assert.equal(off.standings[0].value, "2 skins", "doubles off: the tap is ignored");
  const wolf = scoreGame(config({ id: "wolf", doubles: true }), players(4), course, range, card(4, { 1: { 0: 3 } }), [{ wolfPartner: 1, doubled: true }]);
  assert.deepEqual(Object.fromEntries(wolf.standings.map((s) => [s.label, s.value])), { P0: "+4", P1: "+4", P2: "-4", P3: "-4" });
});

test("money by hole: each player's P&L per hole adds up to their total", async () => {
  const { moneyByHole } = await import("./roundGames.ts");
  const strokes = card(3, { 0: { 0: 3 }, 1: { 1: 2 } });
  strokes[2][17] = null as unknown as number; // hole 18 not finished for everyone
  const cfg = config({ id: "skins", birdiesDouble: true, eaglesTriple: true, stake: 5 });
  const byHole = moneyByHole(cfg, players(3), course, range, strokes)!;
  // Hole 1: P0's birdie skin ×2 = 2 skins × $5 from each of 2 others. Hole 2: P1's eagle skin ×3 = 3 skins.
  assert.deepEqual(byHole.map((row) => row.slice(0, 2)), [[20, -15], [-10, 30], [-10, -15]]);
  assert.equal(byHole[0][17], null, "an unfinished hole has no P&L yet");
  const total = scoreGame(cfg, players(3), course, range, strokes).playerMoney!;
  byHole.forEach((row, p) => assert.equal(row.reduce<number>((sum, v) => sum + (v ?? 0), 0), total[p]));
  assert.equal(moneyByHole(config({ id: "skins" }), players(3), course, range, strokes), null, "no stake = no P&L");
});
