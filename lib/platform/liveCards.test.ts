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

// H5C Part 2 — saved Golf Trips: par is reference information, never an automatically entered score (owner 2026-10-21).
test("saved trips: untouched holes stay empty with pars known — partial cards aren't complete and never match by par", async () => {
  const { countedStrokes, sheetCardFromScoring } = await import("./liveCards.ts");
  const holes = par.map((p, i) => (i < 3 ? p + 1 : null));
  assert.deepEqual(countedStrokes(holes, par, true), holes, "nothing filled in");
  assert.deepEqual(countedStrokes(holes, par).slice(3), par.slice(3), "elsewhere (preview, Play a round) untouched = par, unchanged");
  assert.deepEqual(countedStrokes(holes, undefined, true), holes, "no pars confirmed: the same");
  assert.deepEqual(countedStrokes(holes, [], false), holes, "no pars at all: nothing to fill with");
  const sheet = sheetCardFromScoring({ holes, par, parIsReference: true, putts: par.map(() => 2), fairways: par.map((p) => (p === 3 ? null : "center")), greens: par.map(() => "left"),
    penalties: par.map(() => ({ fairway: false, green: false })), attestStrokes: par.map((p, i) => (i < 3 ? p + 1 : null)) });
  assert.deepEqual(sheet.strokes, holes);
  assert.deepEqual(sheet.entered, holes.map((h) => h !== null));
  const card = liveCardFromSheet("g1", "me", sheet);
  assert.equal(cardComplete(card, par), false, "15 untouched holes: not complete");
  assert.equal(readyToSubmit(card, par, true), false);
  assert.deepEqual(mismatchedHoles(card), [], "untouched on both phones isn't a disagreement");
  // My attester entered par on hole 5 where I typed nothing: that's a mismatch, never 'both par'.
  assert.deepEqual(mismatchedHoles(liveCardFromSheet("g1", "me", { ...sheet, attestStrokes: sheet.attestStrokes.map((s, i) => (i === 4 ? par[4] : s)) })), [5]);
});

test("saved trips: all 18 entered (and attested) is complete exactly as before; a corrected hole counts as entered", async () => {
  const { sheetCardFromScoring } = await import("./liveCards.ts");
  const holes = par.map((p, i) => p + (i % 3 === 0 ? 1 : 0));
  const base = { putts: par.map(() => 2), fairways: par.map((p) => (p === 3 ? null : "center" as const)), greens: par.map(() => "left" as const), penalties: par.map(() => ({ fairway: false, green: false })) };
  const sheet = sheetCardFromScoring({ holes, par, parIsReference: true, ...base, attestStrokes: holes });
  assert.deepEqual(sheet.strokes, holes);
  assert.equal(readyToSubmit(liveCardFromSheet("g1", "me", sheet), par, true), true);
  assert.deepEqual(scoredCardFrom(liveCardFromSheet("g1", "me", sheet)).strokes, holes, "the submitted card is exactly what was entered");
  // A correction changes hole 7 on my card; until my attester re-enters it, it's the one mismatch.
  const corrected = sheetCardFromScoring({ holes: holes.map((h, i) => (i === 6 ? 3 : h)), par, parIsReference: true, ...base, attestStrokes: holes });
  assert.deepEqual(mismatchedHoles(liveCardFromSheet("g1", "me", corrected)), [7]);
});
