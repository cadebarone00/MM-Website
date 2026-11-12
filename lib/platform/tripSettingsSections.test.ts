import { test } from "node:test";
import assert from "node:assert/strict";
import { GENERAL_CARDS, LIVE_GENERAL_CARDS, ORGANIZER_SECTIONS } from "./tripSettingsSections.ts";

test("General Settings then Players lead the General cards for everyone, and neither is under Organizer", () => {
  for (const cards of [GENERAL_CARDS, LIVE_GENERAL_CARDS]) assert.deepEqual(cards.slice(0, 2), ["General Settings", "Players"]);
  for (const card of ["General Settings", "Players"]) assert.equal(ORGANIZER_SECTIONS.some(group => (group.cards as readonly string[]).includes(card)), false);
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
