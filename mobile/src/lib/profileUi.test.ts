/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { nineHolePairs } from "@/lib/platform/playerRounds";
import { profileDay, roundToPar, roundsLabel, sheetDifferential, underScore, ROUND_LETTER } from "./profileUi.ts";

test("dates never slip a day", () => {
  assert.equal(profileDay("2026-11-24"), "Nov 24, 2026");
  assert.equal(profileDay(null), null);
});

test("under the score: differential, 9+9, waiting, not counted", () => {
  assert.equal(underScore({ countsForHandicap: true, differential: 12.3 }, undefined), "12.3");
  assert.equal(underScore({ countsForHandicap: false, differential: null }, "waiting"), "Waiting for 9");
  assert.equal(underScore({ countsForHandicap: false, differential: null }, { differential: 14.1 }), "14.1 · 9+9");
  assert.equal(underScore({ countsForHandicap: false, differential: null }, undefined), "Not counted");
  assert.equal(sheetDifferential({ countsForHandicap: true, differential: 12 }, undefined), "12.0");
  assert.equal(sheetDifferential({ countsForHandicap: false, differential: null }, "waiting"), "—");
});

test("to par, labels and letters", () => {
  assert.equal(roundToPar([{ par: 4, strokes: 5 }, { par: 3, strokes: 3 }]), "+1");
  assert.equal(roundToPar([{ par: 4, strokes: 3 }]), "-1");
  assert.equal(roundToPar([{ par: 4, strokes: 4 }]), "E");
  assert.equal(roundToPar([]), "—");
  assert.equal(roundsLabel(1), "1 round");
  assert.equal(roundsLabel(3), "3 rounds");
  assert.equal(ROUND_LETTER.personal?.letter, "P");
  assert.equal(ROUND_LETTER.history, undefined);
});

test("the shared 9-hole pairing runs in the app", () => {
  assert.equal(nineHolePairs([]).size, 0);
});
