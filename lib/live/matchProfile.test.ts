import test from "node:test";
import assert from "node:assert/strict";
import { matchProfileScorecard, profileMatch, type MatchProfileEntry } from "./matchProfile";
import type { LiveTournamentSnapshot } from "./types";

test("profile exposes only this match's round and players, preserving missing strokes", () => {
  const snapshot: LiveTournamentSnapshot = {
    players: {}, courses: { course: { id: "course", name: "Course", holes: [{ number: 1, par: 4, yards: 400 }], rating: null, slope: null } }, roundCourses: { 2: "course" },
    matchBoxes: [{ id: "match", seasonYear: 2027, session: 2, matchNumber: 1, format: "Singles", teeTime: new Date(), maroonPlayers: ["a"], whitePlayers: ["b"], state: "Live", started: true }],
    scores: new Map([
      ["a:2:1", { seasonYear: 2027, player: "a", round: 2, hole: 1, score: 4, putts: 2, fir: true, gir: true, hostEdited: false }],
      ["b:1:1", { seasonYear: 2027, player: "b", round: 1, hole: 1, score: 3, putts: 1, fir: true, gir: true, hostEdited: false }],
    ]),
  };
  assert.deepEqual(matchProfileScorecard(snapshot, "match"), { courseName: "Course", holes: [{ number: 1, par: 4, yards: 400, scores: { a: 4, b: null } }] });
  assert.equal(matchProfileScorecard(snapshot, "missing"), null);
  snapshot.roundCourses = {};
  assert.equal(matchProfileScorecard(snapshot, "match"), null);
});

test("official completion awards the correct points while upcoming matches remain unscored", () => {
  const entry: MatchProfileEntry = { match: { id: "id", season_year: 2027, round: 2, format: "Singles", maroon_players: ["a"], white_players: ["b"] }, officialState: null, odds: null, oddsHistory: [], scorecard: null };
  assert.equal(profileMatch(entry).status, "scheduled");
  assert.equal(profileMatch(entry).maroonPts, 0);
  entry.match.tee_time = "2027-01-06T15:30:00Z";
  assert.equal(profileMatch(entry).teeTimeCst, "9:30 AM");
  entry.officialState = { status: "complete", thru: 16, leader: "white", margin: 3 };
  assert.equal(profileMatch(entry).status, "final");
  assert.equal(profileMatch(entry).whitePts, 1);
  assert.equal(profileMatch(entry).holesRemaining, 2);
  entry.officialState = { status: "closed_out", thru: 18, leader: "tie", margin: 0 };
  assert.equal(profileMatch(entry).maroonPts, 0.5);
  assert.equal(profileMatch(entry).whitePts, 0.5);
});
