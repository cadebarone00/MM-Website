import { test } from "node:test";
import assert from "node:assert/strict";
import { overlayConfirmedRoster } from "./confirmedRosterOverlay.ts";
import type { Tournament } from "./types.ts";
import type { RosterEntry } from "@/lib/live/types";

function tournamentWithRoster(maroon: string[], white: string[]): Tournament {
  return {
    slug: "2027",
    editionLabel: "The Maroon Masters 2027",
    year: 2027,
    venue: "Mission Hills CC",
    location: "Palm Springs, CA",
    dateLabel: "January 6–9, 2027",
    startDate: "2027-01-06",
    endDate: "2027-01-09",
    roster: { maroon, white },
    maroonPts: 0,
    whitePts: 0,
    pointsAvailable: 33,
    pointsToWin: 17,
    matches: [],
    individualLeaderboard: [],
  };
}

const confirmedRoster: RosterEntry[] = [
  { seasonYear: 2027, playerSlug: "cade-barone", team: "maroon" },
  { seasonYear: 2027, playerSlug: "cam-latto", team: "white" },
  { seasonYear: 2027, playerSlug: "drew-weisser", team: "maroon" },
];

test("overlayConfirmedRoster fills an empty roster from the confirmed roster, split by team", () => {
  const result = overlayConfirmedRoster(tournamentWithRoster([], []), confirmedRoster);
  assert.deepEqual(result.roster, { maroon: ["cade-barone", "drew-weisser"], white: ["cam-latto"] });
});

test("overlayConfirmedRoster leaves a non-empty roster alone even if a confirmed roster exists", () => {
  const result = overlayConfirmedRoster(tournamentWithRoster(["already-here"], []), confirmedRoster);
  assert.deepEqual(result.roster, { maroon: ["already-here"], white: [] });
});

test("overlayConfirmedRoster leaves an empty roster empty when there's no confirmed roster either", () => {
  const result = overlayConfirmedRoster(tournamentWithRoster([], []), []);
  assert.deepEqual(result.roster, { maroon: [], white: [] });
});

test("overlayConfirmedRoster doesn't mutate every other field", () => {
  const tournament = tournamentWithRoster([], []);
  const result = overlayConfirmedRoster(tournament, confirmedRoster);
  assert.equal(result.slug, tournament.slug);
  assert.equal(result.maroonPts, tournament.maroonPts);
});
