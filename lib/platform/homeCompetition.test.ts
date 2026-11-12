import { test } from "node:test";
import assert from "node:assert/strict";
import { homeCompetitionSummary } from "./homeCompetition";

const rounds = [
  { number: 1, dayNumber: 1, format: "Fourball", course: "Mission Hills CC" }, { number: 2, dayNumber: 1, format: "Alt Shot" },
  { number: 3, dayNumber: 2, format: "Singles" }, { number: 4, dayNumber: 3 },
];
const scoring = [
  { round: 1, matchPlay: true, pointsPerMatch: 1, nassau: false, pointsAvailable: 4 },
  { round: 2, matchPlay: true, pointsPerMatch: 1, nassau: false, pointsAvailable: 4 },
  { round: 3, matchPlay: true, pointsPerMatch: 1, nassau: false, pointsAvailable: 8 },
];

test("no competition: nothing to summarize", () => {
  assert.equal(homeCompetitionSummary({ types: { individual: null, team: null }, rounds }), null);
});

test("team & individual: type, formats, days, rounds, points and what wins", () => {
  const summary = homeCompetitionSummary({ types: { individual: "Stroke Play", team: "2 Teams" }, rounds, scoring });
  assert.ok(summary);
  assert.equal(summary.type, "Team & Individual");
  assert.equal(summary.teamFormat, "2 Teams");
  assert.equal(summary.individualFormat, "Stroke Play");
  assert.equal(summary.days, 3);
  assert.deepEqual(summary.rounds.map(r => `${r.number}:${r.format}`), ["1:Fourball", "2:Alt Shot", "3:Singles", "4:Format not set"]);
  assert.equal(summary.rounds[0].course, "Mission Hills CC");
  assert.equal(summary.rounds[1].course, "Course TBD");
  assert.equal(summary.totalPoints, 16);
  assert.equal(summary.toWin, 8.5);
});

test("team only says 3 Ball / 4 Ball the way golfers do; individual only has no team points", () => {
  assert.equal(homeCompetitionSummary({ types: { individual: null, team: "3-Ball" }, rounds, scoring })?.teamFormat, "3 Ball");
  assert.equal(homeCompetitionSummary({ types: { individual: null, team: "4-Ball" }, rounds, scoring })?.type, "Team");
  const solo = homeCompetitionSummary({ types: { individual: "Stroke Play", team: null }, rounds, scoring });
  assert.equal(solo?.type, "Individual");
  assert.equal(solo?.teamFormat, null);
  assert.equal(solo?.totalPoints, null);
  assert.equal(solo?.toWin, null);
});

test("team without any points settings: no total yet", () => {
  const summary = homeCompetitionSummary({ types: { individual: null, team: "2 Teams" }, rounds, scoring: [] });
  assert.equal(summary?.totalPoints, null);
  assert.equal(summary?.toWin, null);
});

test("your team: 2 Teams = your team's name; 3 Ball / 4 Ball / Pairs = your teammates' last names", async () => {
  const { yourTeam, teamGroups } = await import("./homeCompetition");
  const players = ["Cade Barone", "Cam Latto", "Drew Weisser", "Jake Parker", "Mike Chen", "Kyle Schnabel"];
  const halves = [[0, 1, 2], [3, 4, 5]];
  assert.equal(yourTeam({ teamFormat: "2 Teams", me: "Cade Barone", players, groups: halves, teamNames: ["Maroon", "White"] }), "Maroon");
  assert.equal(yourTeam({ teamFormat: "2 Teams", me: "mike chen", players, groups: halves, teamNames: ["Maroon", "White"] }), "White");
  assert.equal(yourTeam({ teamFormat: "3 Ball", me: "Cade Barone", players, groups: halves }), "Latto · Weisser");
  assert.equal(yourTeam({ teamFormat: "4 Ball", me: "Jake Parker", players, groups: [[0, 1, 2, 3], [4, 5]] }), "Barone · Latto · Weisser");
  assert.equal(yourTeam({ teamFormat: "2 Teams", me: "Someone Else", players, groups: halves }), null);
  assert.equal(yourTeam({ teamFormat: "2 Teams", me: "Cade Barone", players, groups: null }), null);
  assert.deepEqual(teamGroups(null, { 0: 0, 1: 1, 2: 0 }), [[0, 2], [1]]);
  assert.deepEqual(teamGroups([[1], [0]], { 0: 0 }), [[1], [0]]);
});
