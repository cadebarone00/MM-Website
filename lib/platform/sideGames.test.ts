import { test } from "node:test";
import assert from "node:assert/strict";
import { sideGameMoney, sideGamesOn } from "./sideGames.ts";

const par = [4, 3, 5, 4, 3, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]; // par 3s: holes 2, 5, 7, 12, 16
const range: [number, number] = [0, 18];

test("greenies: the winner collects from each other player; Carry over adds the next par 3's value", () => {
  const inputs = Array.from({ length: 18 }, () => ({}));
  inputs[1] = { greenie: 0 };    // hole 2: player 0
  inputs[4] = { greenie: null }; // hole 5: carry
  inputs[6] = { greenie: 2 };    // hole 7: player 2 wins 2 greenies
  const money = sideGameMoney({ greenies: { value: 5 } }, 4, par, range, inputs)!;
  assert.deepEqual(money.total, [15 - 10, -5 - 10, -5 + 30, -5 - 10]);
  assert.equal(money.byHole[2][6], 30);
  assert.equal(money.byHole[0][4], null, "a carried hole has no money yet");
  assert.equal(money.total.reduce((a, b) => a + b, 0), 0);
});

test("a greenie not tapped yet doesn't count or carry", () => {
  const inputs = Array.from({ length: 18 }, () => ({}));
  inputs[6] = { greenie: 1 };
  assert.deepEqual(sideGameMoney({ greenies: { value: 2 } }, 3, par, range, inputs)!.total, [-2, 4, -2]);
});

test("longest drive and closest to the pin only on their holes; both can be on the same par 3 as a greenie", () => {
  const inputs = Array.from({ length: 18 }, () => ({}));
  inputs[2] = { longestDrive: 1 };            // hole 3 (selected)
  inputs[3] = { longestDrive: 0 };            // hole 4 (not selected) → ignored
  inputs[1] = { closestPin: 2, greenie: 2 };  // hole 2: CTP + greenie
  const money = sideGameMoney({ greenies: { value: 1 }, longestDrive: { value: 10, holes: [3] }, closestPin: { value: 4, holes: [2] } }, 3, par, range, inputs)!;
  assert.deepEqual(money.total, [-10 - 4 - 1, 20 - 4 - 1, -10 + 8 + 2]);
  assert.deepEqual(sideGamesOn({ greenies: { value: 1 }, closestPin: { value: 4, holes: [2] } }, 1, par), ["greenie", "closestPin"]);
  assert.deepEqual(sideGamesOn({ greenies: { value: 1 } }, 0, par), [], "greenies only on par 3s");
  assert.equal(sideGameMoney(undefined, 3, par, range, inputs), null);
});
