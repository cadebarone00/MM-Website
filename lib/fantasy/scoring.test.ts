import { test } from "node:test";
import assert from "node:assert/strict";
import { fantasyPointsForRound, playerFantasyPointsForRound } from "./scoring.ts";
import type { Tournament, HoleStat, RoundScorecard } from "@/lib/data/types";

function hole(score: number, diff: number): HoleStat {
  return { hole: 1, par: 4, yards: 400, score, putts: 2, fir: 1, gir: 1, diff };
}

function round(roundNumber: number, holes: HoleStat[]): RoundScorecard {
  return { round: roundNumber, course: "Test Course", total: 0, toPar: 0, putts: 0, girHit: 0, girTotal: 0, firHit: 0, firTotal: 0, holes };
}

function tournamentWith(scorecards: Tournament["scorecards"]): Tournament {
  return {
    slug: "2027",
    editionLabel: "The Maroon Masters 2027",
    year: 2027,
    venue: "Mission Hills CC",
    location: "Palm Springs, CA",
    dateLabel: "January 6-9, 2027",
    startDate: "2027-01-06",
    endDate: "2027-01-09",
    roster: { maroon: ["cade-barone"], white: ["cam-latto"] },
    maroonPts: 0,
    whitePts: 0,
    pointsAvailable: 33,
    pointsToWin: 17,
    matches: [],
    individualLeaderboard: [],
    scorecards,
  };
}

test("playerFantasyPointsForRound sums only that round's played holes", () => {
  const tournament = tournamentWith([
    { player: "cade-barone", team: "maroon", rounds: [round(1, [hole(3, -1), hole(4, 0)]), round(2, [hole(5, 1)])] },
  ]);
  // Round 1: birdie (3) + par (1) = 4. Round 2 shouldn't count.
  assert.equal(playerFantasyPointsForRound(tournament, "cade-barone", 1), 4);
});

test("playerFantasyPointsForRound is null when that round hasn't started", () => {
  const tournament = tournamentWith([{ player: "cade-barone", team: "maroon", rounds: [round(1, [hole(0, 0)])] }]);
  assert.equal(playerFantasyPointsForRound(tournament, "cade-barone", 1), null);
  assert.equal(playerFantasyPointsForRound(tournament, "cade-barone", 2), null);
});

test("playerFantasyPointsForRound is null for a player with no scorecard at all", () => {
  const tournament = tournamentWith([]);
  assert.equal(playerFantasyPointsForRound(tournament, "cade-barone", 1), null);
});

test("fantasyPointsForRound sums the three picks' round points", () => {
  const tournament = tournamentWith([
    { player: "cade-barone", team: "maroon", rounds: [round(1, [hole(3, -1)])] }, // birdie = 3
    { player: "cam-latto", team: "white", rounds: [round(1, [hole(2, -2)])] }, // eagle = 5
    { player: "drew-weisser", team: "maroon", rounds: [round(1, [hole(4, 0)])] }, // par = 1
  ]);
  assert.equal(
    fantasyPointsForRound(tournament, { maroonPlayer: "cade-barone", whitePlayer: "cam-latto", wildcardPlayer: "drew-weisser" }, 1),
    9
  );
});

test("fantasyPointsForRound is null until at least one pick has started that round", () => {
  const tournament = tournamentWith([]);
  assert.equal(
    fantasyPointsForRound(tournament, { maroonPlayer: "cade-barone", whitePlayer: "cam-latto", wildcardPlayer: "drew-weisser" }, 1),
    null
  );
});

test("fantasyPointsForRound counts a started pick and treats the rest as 0 so far", () => {
  const tournament = tournamentWith([{ player: "cade-barone", team: "maroon", rounds: [round(1, [hole(3, -1)])] }]);
  assert.equal(
    fantasyPointsForRound(tournament, { maroonPlayer: "cade-barone", whitePlayer: "cam-latto", wildcardPlayer: "drew-weisser" }, 1),
    3
  );
});
