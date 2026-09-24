import { test } from "node:test";
import assert from "node:assert/strict";
import { archivedMatchesForPlayer } from "./archivedMatches.ts";
import { palmSprings2026 } from "../data/2026-palm-springs.ts";
import { getPlayerProfile } from "../data/players/index.ts";
import type { PlayerScorecard } from "../data/types.ts";

test("Cade's account slug resolves all eight completed 2026 matches", () => {
  const matches = archivedMatchesForPlayer(palmSprings2026, "cade-barone");
  assert.equal(matches.length, 8);
  assert.ok(matches.every((match) => match.status === "Past"));
  assert.ok(matches.every((match) => match.progressLabel === "Final"));
  const p26m10 = matches.find((match) => match.id === "p26-m10");
  assert.deepEqual(p26m10?.maroonPlayers, ["cam-latto"]);
  assert.deepEqual(p26m10?.whitePlayers, ["cade-barone"]);
  assert.equal(p26m10?.statusLabel, "1 Up");
  assert.equal(p26m10?.leader, "maroon");
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

test("without a scorecard on file, falls back to the tournament venue and the match's day as the round number", () => {
  const matches = archivedMatchesForPlayer(palmSprings2026, "cade-barone");
  const p26m10 = matches.find((match) => match.id === "p26-m10");
  assert.equal(p26m10?.course, palmSprings2026.venue);
  assert.equal(p26m10?.roundFormatLabel, "Round 2 · Afternoon · Singles");
});

test("with a scorecard on file, the course comes from the player's real per-round archive (not the venue) and the round number is that player's chronological session count", () => {
  // Cade's day-2-afternoon Singles match (p26-m10) is his 4th session of the
  // trip: day1 Morning, day1 Afternoon, day2 Morning, day2 Afternoon.
  const scorecards: PlayerScorecard[] = [
    {
      player: "cade-barone",
      team: "white",
      rounds: [
        { round: 1, course: "Course A", total: 80, toPar: 8, putts: 30, girHit: 8, girTotal: 18, firHit: 8, firTotal: 14, holes: [] },
        { round: 2, course: "Course B", total: 78, toPar: 6, putts: 30, girHit: 8, girTotal: 18, firHit: 8, firTotal: 14, holes: [] },
        { round: 3, course: "Course C", total: 76, toPar: 4, putts: 30, girHit: 8, girTotal: 18, firHit: 8, firTotal: 14, holes: [] },
        { round: 4, course: "Course D", total: 74, toPar: 2, putts: 30, girHit: 8, girTotal: 18, firHit: 8, firTotal: 14, holes: [] },
      ],
    },
  ];
  const matches = archivedMatchesForPlayer(palmSprings2026, "cade-barone", scorecards);
  const p26m10 = matches.find((match) => match.id === "p26-m10");
  assert.equal(p26m10?.course, "Course D");
  assert.equal(p26m10?.roundFormatLabel, "Round 4 · Afternoon · Singles");
});
