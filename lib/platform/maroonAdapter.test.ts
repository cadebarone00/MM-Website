import { test } from "node:test";
import assert from "node:assert/strict";
import { pastTournaments } from "@/lib/data";
import { getPlayerDisplayName } from "@/lib/data/players";
import type { RealMatch, Tournament } from "@/lib/data/types";
import { liveMatchRound, maroonSiteData, matchResult, toParLabel, type MaroonAdapterInput, type MaroonEditionRow } from "./maroonAdapter.ts";

const edition = (year: number): MaroonEditionRow => ({
  name: "The Maroon Tournament", shortName: "The Maroon", branding: { primary: "#500001", secondary: "#fbf8f1", accent: "#b8945a" },
  seasonYear: year, destination: null, startDate: null, endDate: null, timezone: "America/Los_Angeles",
  scoring: { pointsForWin: 1, pointsForHalve: 0.5 },
  teams: [{ key: "maroon", name: "Team Maroon", color: "#500001" }, { key: "white", name: "Team White", color: "#fbf8f1" }],
});

const history = (year: number): MaroonAdapterInput => ({
  edition: edition(year), tournament: pastTournaments.find((t) => t.year === year)!, names: {}, courses: [], liveRounds: null,
});

const emptyLive: Tournament = {
  slug: "2027", editionLabel: "Maroon Tournament 2027", year: 2027, venue: "Venue pending", location: "", dateLabel: "Dates pending",
  startDate: "", endDate: "", roster: { maroon: [], white: [] }, maroonPts: 0, whitePts: 0, pointsAvailable: 0, pointsToWin: 1,
  matches: [], individualLeaderboard: [],
};

const teamName = (key: "maroon" | "white") => (key === "maroon" ? "Team Maroon" : "Team White");
const match = (over: Partial<RealMatch>): RealMatch => ({
  id: "m", day: 1, session: "Morning", format: "Singles", maroonPlayers: ["cam-latto"], whitePlayers: ["cade-barone"], maroonPts: 0, whitePts: 0, ...over,
});

test("every history year keeps the old points, matches, roster and leaderboard", () => {
  for (const legacy of pastTournaments) {
    const { site, matchSessions } = maroonSiteData(history(legacy.year));
    assert.deepEqual(site.teams.map((t) => [t.id, t.points]), [["maroon", legacy.maroonPts], ["white", legacy.whitePts]], `${legacy.year} points`);
    assert.equal(site.matches.length, legacy.matches.length, `${legacy.year} match count`);
    assert.equal(site.status, "final");
    assert.equal(Object.keys(matchSessions).length, legacy.matches.length, `${legacy.year} every match has a round`);
    const rosterSize = legacy.roster.maroon.length + legacy.roster.white.length;
    assert.ok(site.players.length >= rosterSize, `${legacy.year} roster`);
    const legacyOrder = [...legacy.individualLeaderboard].sort((a, b) => a.toPar - b.toPar).map((s) => s.toPar);
    assert.deepEqual(site.standings.map((s) => s.score), legacyOrder.map(toParLabel), `${legacy.year} leaderboard order`);
    assert.ok(site.results?.headline, `${legacy.year} result`);
  }
});

test("archive-only matches never appear (2024's Round 7 slot)", () => {
  const legacy = pastTournaments.find((t) => t.archiveOnlyMatches?.length)!;
  assert.ok(legacy, "a history year has archive-only matches");
  const ids = new Set(maroonSiteData(history(legacy.year)).site.matches.map((m) => m.id));
  for (const hidden of legacy.archiveOnlyMatches!) assert.equal(ids.has(hidden.id), false, hidden.id);
});

test("2026: names, sides, results and the winner match the history file", () => {
  const { site } = maroonSiteData(history(2026));
  const first = site.matches.find((m) => m.id === "p26-m1")!;
  assert.deepEqual(first.sideA, { teamId: "maroon", players: ["drew-weisser", "luke-sherrell"] });
  assert.deepEqual(first.sideB, { teamId: "white", players: ["cade-barone", "jackson-collins"] });
  assert.equal(first.result, "Maroon wins 1 UP");
  assert.equal(site.matches.find((m) => m.id === "p26-m3")!.result, "Maroon wins 4&3");
  assert.equal(site.matches.find((m) => m.id === "p26-m6")!.result, "Halved");
  assert.equal(site.results?.headline, "Team Maroon wins 17–16");
  assert.equal(site.players.find((p) => p.id === "cade-barone")?.name, getPlayerDisplayName("cade-barone"));
  assert.equal(site.players.find((p) => p.id === "cade-barone")?.teamId, "white");
});

test("history rounds follow the old round numbering, one session per day+session", () => {
  const legacy = pastTournaments.find((t) => t.year === 2026)!;
  const { site, matchSessions } = maroonSiteData(history(2026));
  const sessions = site.days.flatMap((d) => d.sessions);
  assert.equal(sessions[0].label, "Round 1");
  assert.equal(new Set(sessions.map((s) => s.id)).size, sessions.length);
  assert.equal(matchSessions["p26-m1"], "r1");
  assert.equal(matchSessions["p26-m4"], "r2");
  assert.equal(site.days[0].date, legacy.dayDates![1]);
});

test("ties share a place on the leaderboard", () => {
  const legacy: Tournament = { ...emptyLive, year: 2024, matches: [match({ id: "a", maroonPts: 1, margin: 2, holesRemaining: 1 })],
    individualLeaderboard: [{ player: "cam-latto", team: "maroon", toPar: 5 }, { player: "cade-barone", team: "white", toPar: 2 }, { player: "pete-peabody", team: "maroon", toPar: 2 }] };
  const { site } = maroonSiteData({ ...history(2024), tournament: legacy });
  assert.deepEqual(site.standings.map((s) => [s.playerId, s.position, s.score]), [["cade-barone", 1, "+2"], ["pete-peabody", 1, "+2"], ["cam-latto", 3, "+5"]]);
});

test("results are built only from recorded data", () => {
  assert.equal(matchResult(match({ status: "scheduled" }), teamName), undefined);
  assert.equal(matchResult(match({ maroonPts: 1 }), teamName), "Maroon wins", "no margin recorded → no invented margin");
  assert.equal(matchResult(match({ whitePts: 1, margin: 3, holesRemaining: 2 }), teamName), "White wins 3&2");
  assert.equal(matchResult(match({ maroonPts: 0.5, whitePts: 0.5 }), teamName), "Halved");
  assert.equal(matchResult(match({ status: "live", leader: "white", margin: 2 }), teamName), "White 2 UP");
  assert.equal(matchResult(match({ status: "live", leader: "tie", margin: 0 }), teamName), "All square");
  assert.equal(toParLabel(0), "E");
  assert.equal(toParLabel(-3), "-3");
});

test("a live year before pairings shows no points, matches, standings or results", () => {
  const { site, matchSessions } = maroonSiteData({ edition: edition(2027), tournament: emptyLive, names: {}, courses: [], liveRounds: [] });
  assert.deepEqual(site.matches, []);
  assert.deepEqual(site.standings, []);
  assert.equal(site.teams.every((t) => t.points === undefined), true, "never a fake 0–0");
  assert.equal(site.results, undefined);
  assert.equal(site.status, "scheduled");
  assert.deepEqual(matchSessions, {});
  assert.equal(site.destination, "", "'Venue pending' is not a place");
});

test("live year: rounds show once locked or played, and matches find their round", () => {
  const rounds = [
    { round: 1, date: "2027-01-06", format: "Fourball", courseId: "c1", courseLocked: true },
    { round: 2, date: "2027-01-06", format: "Alt Shot", courseId: "c1", courseLocked: true },
    { round: 3, date: "2027-01-07", format: "Singles", courseId: "c2", courseLocked: false },
    { round: 4, date: null, format: null, courseId: null, courseLocked: false },
  ];
  // getSeasonTournament numbers live days by date index; undated rounds keep day = round.
  const legacy: Tournament = { ...emptyLive, dayDates: { 1: "2027-01-06", 2: "2027-01-07" },
    roster: { maroon: ["cam-latto"], white: ["cade-barone"] },
    matches: [match({ id: "x1", day: 1, session: "Morning", status: "live", leader: "maroon", margin: 1, thru: 7 }), match({ id: "x2", day: 1, session: "Afternoon", status: "scheduled", teeTimeCst: "1:10 PM" })] };
  const { site, matchSessions } = maroonSiteData({ edition: edition(2027), tournament: legacy, names: { "cam-latto": "Cam L." }, courses: [{ id: "c1", name: "North", par: 72, yards: 7000, photos: [], holes: [] }], liveRounds: rounds });
  assert.deepEqual(matchSessions, { x1: "r1", x2: "r2" });
  assert.deepEqual(site.days.flatMap((d) => d.sessions.map((s) => [s.id, s.courseId, s.status])), [["r1", "c1", "live"], ["r2", "c1", "scheduled"]], "unlocked unplayed rounds stay hidden");
  assert.equal(site.status, "live");
  assert.deepEqual(site.matches[0].progress, "Thru 7");
  assert.equal(site.matches[1].teeTime, "1:10 PM");
  assert.equal(site.players.find((p) => p.id === "cam-latto")?.name, "Cam L.");
  assert.deepEqual(site.teams.map((t) => t.points), [0, 0], "points appear once a match is under way");
  assert.equal(site.courses[0].par, 72);
});

test("live round lookup refuses to guess", () => {
  const rows = [1, 2, 3].map((round) => ({ round, date: "2027-01-06", format: null, courseId: null, courseLocked: true }));
  assert.equal(liveMatchRound({ day: 1, session: "Morning" }, rows, { 1: "2027-01-06" }), 1);
  assert.equal(liveMatchRound({ day: 1, session: "Afternoon" }, rows, { 1: "2027-01-06" }), null, "three rounds on one date");
  assert.equal(liveMatchRound({ day: 9, session: "Morning" }, rows, {}), null);
});
