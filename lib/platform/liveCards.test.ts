import { test } from "node:test";
import assert from "node:assert/strict";
import { cardComplete, liveCardFromSheet, mismatchedHoles, readyToSubmit, scoredCardFrom, type SheetCard } from "./liveCards.ts";

const par = Array.from({ length: 18 }, (_, i) => (i === 2 ? 3 : 4));
const sheet = (overrides: Partial<SheetCard> = {}): SheetCard => ({
  strokes: par.map((p) => p), putts: par.map(() => 2), fairways: par.map((p) => (p === 3 ? null : "center")), greens: par.map(() => "left"),
  penalties: par.map(() => ({ fairway: false, green: false })), attestStrokes: par.map((p) => p), ...overrides,
});

test("a full card where the attester agrees on every hole is ready", () => {
  const card = liveCardFromSheet("g1", "me", sheet());
  assert.deepEqual(mismatchedHoles(card), []);
  assert.equal(cardComplete(card, par), true);
  assert.equal(readyToSubmit(card, par, true), true);
});

test("one stroke apart on one hole blocks Submit and names the hole", () => {
  const attestStrokes = par.map((p, i) => (i === 6 ? p + 1 : p));
  const card = liveCardFromSheet("g1", "me", sheet({ attestStrokes }));
  assert.deepEqual(mismatchedHoles(card), [7]);
  assert.equal(readyToSubmit(card, par, true), false);
});

test("a hole the attester hasn't entered yet counts as not matching", () => {
  const card = liveCardFromSheet("g1", "me", sheet({ attestStrokes: par.map((p, i) => (i === 0 ? null : p)) }));
  assert.deepEqual(mismatchedHoles(card), [1]);
});

test("par 3s need no fairway; any other missing stat means not complete", () => {
  assert.equal(cardComplete(liveCardFromSheet("g1", "me", sheet()), par), true);
  assert.equal(cardComplete(liveCardFromSheet("g1", "me", sheet({ putts: par.map((_, i) => (i === 5 ? null : 2)) })), par), false);
  assert.equal(cardComplete(liveCardFromSheet("g1", "me", sheet({ fairways: par.map(() => null) })), par), false);
});

test("a solo card (no attester) only needs to be complete", () => {
  const card = liveCardFromSheet("g1", "me", sheet({ attestStrokes: par.map(() => null) }));
  assert.equal(readyToSubmit(card, par, false), true);
});

test("scoredCardFrom keeps stats and penalties, and can take chosen strokes", () => {
  const card = liveCardFromSheet("g1", "me", sheet({ penalties: par.map((_, i) => ({ fairway: false, green: i === 4 })) }));
  const scored = scoredCardFrom(card, par.map(() => 5));
  assert.equal(scored.strokes[0], 5);
  assert.equal(scored.penalties?.[4].green, true);
  assert.throws(() => scoredCardFrom(liveCardFromSheet("g1", "me", sheet({ strokes: par.map((p, i) => (i === 0 ? null : p)) }))), /Hole 1 has no score/);
});

test("the sheet's untouched holes count as par on the saved live card, same as on screen", async () => {
  const { sheetCardFromScoring } = await import("./liveCards.ts");
  const holes = par.map((p, i) => (i < 3 ? p + 1 : null));
  const sheet = sheetCardFromScoring({ holes, par, putts: par.map(() => 2), fairways: par.map((p) => (p === 3 ? null : "center")), greens: par.map(() => "left"),
    penalties: par.map(() => ({ fairway: false, green: false })), attestStrokes: par.map((p, i) => (i < 3 ? p + 1 : p)) });
  assert.deepEqual(sheet.strokes.slice(2, 5), [par[2] + 1, par[3], par[4]]);
  const card = liveCardFromSheet("g1", "me", sheet);
  assert.deepEqual(mismatchedHoles(card), []);
  assert.equal(cardComplete(card, par), true);
});
