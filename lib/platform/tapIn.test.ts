import { test } from "node:test";
import assert from "node:assert/strict";
import { homeRosterFull, tapInPath } from "./tapIn";

test("Tap In uses only a valid read-only watch code", () => {
  assert.equal(tapInPath("w4k-9pz"), "/tap-in/W4K9PZ");
  for (const code of [null, undefined, "", "sample-link", "K7Q4MZ", "W4K9PZ?x=1", "https://evil.test/W4K9PZ"]) assert.equal(tapInPath(code), null);
});
test("full rosters or complete teams hide the player invite; unknown capacity does not imply full", () => {
  assert.equal(homeRosterFull(4, 8, false), false);
  assert.equal(homeRosterFull(8, 8, false), true);
  assert.equal(homeRosterFull(9, 8, false), true);
  assert.equal(homeRosterFull(4, null, true), true);
  assert.equal(homeRosterFull(4, null, false), false);
  assert.equal(homeRosterFull(0, 0, false), false);
});
