/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeText } from "./tabBadges.tsx";

test("no badge at 0 or for a bad number", () => {
  assert.equal(badgeText(0), null);
  assert.equal(badgeText(-2), null);
  assert.equal(badgeText(Number.NaN), null);
});

test("shows the count up to 9, then 9+", () => {
  assert.equal(badgeText(1), "1");
  assert.equal(badgeText(9), "9");
  assert.equal(badgeText(12), "9+");
});
