import { test } from "node:test";
import assert from "node:assert/strict";
import { findUnclaimedSlotForUsername, type PlayerSlotRow } from "./matchPlayerUsername";

const slots: PlayerSlotRow[] = [
  { player_slug: "kyle-schnabel", username: "kylegolf", claimed_by: null },
  { player_slug: "cade-barone", username: "cadeb", claimed_by: "some-uuid" },
  { player_slug: "cam-latto", username: null, claimed_by: null },
];

test("matches an unclaimed slot case-insensitively", () => {
  const match = findUnclaimedSlotForUsername("KyleGolf", slots);
  assert.equal(match?.player_slug, "kyle-schnabel");
});

test("does not match an already-claimed slot", () => {
  const match = findUnclaimedSlotForUsername("cadeb", slots);
  assert.equal(match, null);
});

test("does not match a slot with no username set yet", () => {
  const match = findUnclaimedSlotForUsername("cam-latto", slots);
  assert.equal(match, null);
});

test("returns null for a username matching no slot", () => {
  const match = findUnclaimedSlotForUsername("randomfan99", slots);
  assert.equal(match, null);
});
