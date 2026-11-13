import assert from "node:assert/strict";
import test from "node:test";
import { golfDayAssignment, golfDayDateLabel, golfDayMatchNames, golfDayRounds, golfDaySummary } from "./golfDay";
import { GOLF_MATCH_PREVIEW, normalizeCompetitor } from "./golfTripPreviewFixture";

test("overview date includes the weekday, full month, ordinal day and year without date rollover", () => {
  assert.equal(golfDayDateLabel("2029-11-05"), "Monday, November 5th, 2029");
  assert.equal(golfDayDateLabel("2026-11-11"), "Wednesday, November 11th, 2026");
  assert.equal(golfDayDateLabel("2026-11-21"), "Saturday, November 21st, 2026");
  assert.equal(golfDayDateLabel("2026-02-30"), "Date not set");
  assert.equal(golfDayDateLabel(), "Date not set");
});

test("golf day uses the named viewer's own current pairing, not the first golfer", () => {
  const pair = GOLF_MATCH_PREVIEW.matches[1];
  const viewer = normalizeCompetitor(pair.left).golfers[0];
  const day = golfDayAssignment(GOLF_MATCH_PREVIEW, ` ${viewer.name.toUpperCase()} `);
  assert.equal(day.player?.name, viewer.name);
  assert.equal(day.pairing, pair);
  assert.equal(golfDayAssignment(GOLF_MATCH_PREVIEW, "Unassigned visitor").pairing, undefined);
  assert.equal(golfDayAssignment(GOLF_MATCH_PREVIEW).player, undefined);
  assert.equal(golfDayAssignment(GOLF_MATCH_PREVIEW, viewer.name, true).player, undefined);
  assert.equal(golfDayAssignment(GOLF_MATCH_PREVIEW, viewer.name, true).pairing, undefined);
});

test("golf day excludes another round's assignment", () => {
  const pair = GOLF_MATCH_PREVIEW.matches[0];
  const viewer = normalizeCompetitor(pair.left).golfers[0];
  const match = { ...GOLF_MATCH_PREVIEW, matches: [{ ...pair, round: GOLF_MATCH_PREVIEW.round + 1 }] };
  assert.equal(golfDayAssignment(match, viewer.name).pairing, undefined);
});

test("overview shows format with teammate for pairs, Format vs opponent for singles, and separates same-day rounds", () => {
  const g = (name: string, teeTime: string) => ({ name, teeTime, hcp: 0, thru: "", score: "", course: "" });
  const pair = { round: 1, left: { golfers: [g("Alex North", "8:00 AM"), g("Sam West", "8:00 AM")] }, right: { golfers: [g("Pat East", "8:00 AM"), g("Taylor South", "8:00 AM")] }, gross: null, net: null };
  const later = { ...pair, round: 2, left: { golfers: [g("Taylor South", "1:30 PM")] }, right: { golfers: [g("Alex North", "1:30 PM")] } };
  const match = { ...GOLF_MATCH_PREVIEW, round: 1, format: "Fourball", matches: [pair, later], leaderboard: [] };
  assert.equal(golfDayMatchNames(match, "Taylor South"), "Fourball w/ East vs North & West");
  assert.equal(golfDayMatchNames(match, "Unknown Person"), "No match assigned");
  const rounds = golfDayRounds(match, { golfDays: "2", day1Rounds: "2", day1Date: "2027-04-22", day2Rounds: "1", day2Date: "2027-04-23", round2Course: "Second Course", round2Format: "Singles" });
  assert.deepEqual(rounds.map(r => r.round), [1, 2]);
  assert.equal(rounds[1].course, "Second Course");
  assert.equal(golfDayAssignment(rounds[1], "Taylor South").player?.teeTime, "1:30 PM");
  assert.equal(golfDayMatchNames(rounds[1], "Taylor South"), "Singles vs North");
});

test("personal summary follows competition visibility and cumulative totals, with earned points only through current round", () => {
  const viewer = "Taylor South";
  const g = { name: viewer, hcp: 0, thru: "F", score: "", teeTime: "", course: "" };
  const pairing = { round: 1, left: { golfers: [g] }, right: { golfers: [{ ...g, name: "Alex North" }] }, gross: { leader: "left" as const, up: 1 }, net: null, result: "1 UP" };
  const row = { ...GOLF_MATCH_PREVIEW.leaderboard[0], golfer: g, total: "+7", netTotal: "+3", today: "+1" };
  const match = { ...GOLF_MATCH_PREVIEW, round: 1, leaderboard: [row], matches: [pairing, { ...pairing, round: 2 }], roundScoring: [{ round: 1, matchPlay: true, pointsPerMatch: 2, nassau: false, pointsAvailable: 2 }] };
  const both = golfDaySummary(match, viewer, { individual: true, team: true });
  assert.equal(both?.total, "+7");
  assert.equal(both?.position, "1 / 1");
  assert.equal(both?.points, 2);
  assert.equal(golfDaySummary(match, viewer, { individual: true, team: false })?.points, undefined);
  assert.equal(golfDaySummary(match, viewer, { individual: false, team: true }), null);
  assert.equal(golfDaySummary(match, viewer, { individual: false, team: false }), null);
  assert.equal(golfDaySummary(match, viewer, { individual: true, team: true }, true), null);
  assert.equal(golfDaySummary(match, "Unknown", { individual: true, team: true })?.total, "\u2014");
});
