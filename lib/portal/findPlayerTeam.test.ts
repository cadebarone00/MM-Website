import { test } from "node:test";
import assert from "node:assert/strict";
import { findPlayerTeam } from "./findPlayerTeam";

// latestCompleted (2026) roster has Cade on White — see lib/data/2026-palm-springs.ts.
// This will need updating once the 2027 roster (lib/data/2027-upcoming.ts) is set,
// at which point findPlayerTeam will start reading from it instead.
test("finds a player's team from the latest completed tournament's roster", () => {
  assert.equal(findPlayerTeam("cade-barone"), "white");
});

test("returns null for a slug not on any known roster", () => {
  assert.equal(findPlayerTeam("nobody-here"), null);
});
