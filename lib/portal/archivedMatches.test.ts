import { test } from "node:test";
import assert from "node:assert/strict";
import { archivedMatchesForPlayer } from "./archivedMatches.ts";
import { palmSprings2026 } from "../data/2026-palm-springs.ts";
import { getPlayerProfile } from "../data/players/index.ts";

test("Cade's account slug resolves all eight completed 2026 matches", () => {
  const matches = archivedMatchesForPlayer(palmSprings2026, "cade-barone");
  assert.equal(matches.length, 8);
  assert.ok(matches.every((match) => match.status === "Past"));
  assert.equal(matches.find((match) => match.id === "p26-m10")?.label, "You vs. Cam Latto");
  assert.ok(matches.every((match) => !match.label.includes("Cade Barone")));
});

test("every roster player's account slug resolves their archived matches", () => {
  for (const name of [...palmSprings2026.roster.maroon, ...palmSprings2026.roster.white]) {
    const slug = getPlayerProfile(name)!.slug;
    const expected = palmSprings2026.matches.filter((match) => [...match.maroonPlayers, ...match.whitePlayers].includes(name)).map((match) => match.id);
    assert.deepEqual(archivedMatchesForPlayer(palmSprings2026, slug).map((match) => match.id), expected);
  }
});

test("a player outside the tournament has no archived matches", () => {
  assert.deepEqual(archivedMatchesForPlayer(palmSprings2026, "unknown-player"), []);
});
