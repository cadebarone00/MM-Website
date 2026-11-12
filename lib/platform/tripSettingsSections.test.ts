import { test } from "node:test";
import assert from "node:assert/strict";
import { GENERAL_CARDS, LIVE_GENERAL_CARDS, ORGANIZER_SECTIONS } from "./tripSettingsSections.ts";

test("Players is the first General card for everyone, and no longer under Organizer", () => {
  assert.equal(GENERAL_CARDS[0], "Players");
  assert.equal(LIVE_GENERAL_CARDS[0], "Players");
  assert.equal(ORGANIZER_SECTIONS.some(group => (group.cards as readonly string[]).includes("Players")), false);
});

test("the General grid keeps its size (6 boxes in the preview)", () => {
  assert.equal(GENERAL_CARDS.length, 6);
});

test("everyone can replay the tour and the tips from General", () => {
  for (const cards of [GENERAL_CARDS, LIVE_GENERAL_CARDS]) {
    assert.ok(cards.includes("Watch the Golf Trips tour"));
    assert.ok(cards.includes("Show tips again"));
  }
});

test("all members can reach Notifications in General settings", () => {
  for (const cards of [GENERAL_CARDS, LIVE_GENERAL_CARDS]) assert.ok(cards.includes("Notifications"));
  assert.equal(ORGANIZER_SECTIONS.some(group => group.cards.includes("Notifications")), false);
});
