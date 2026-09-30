import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSection, type SectionKey } from "./sectionRules.ts";
import { createdSetup } from "./testFixtures.ts";
import type { TournamentSetup } from "./setup.ts";

function teamsSetup(): TournamentSetup {
  const s = createdSetup();
  s.competitionType = "teams";
  s.edition.startDate = "2027-04-15";
  s.edition.endDate = "2027-04-17";
  s.teams = [{ id: "a", key: "blue", name: "Blue", color: "#1f4e9c", captainPlayerId: null }, { id: "b", key: "gold", name: "Gold", color: "#b8860b", captainPlayerId: null }];
  s.players = [{ id: "p1", name: "Ann", email: null, handicap: 4, teamKey: "blue" }, { id: "p2", name: "Bo", email: null, handicap: 9, teamKey: "gold" }];
  s.courses = [{ id: "c1", name: "Course", city: null, state: null, teeName: null, par: 72, yards: 6800, rating: 72, slope: 130 }];
  return s;
}

const fields = (section: SectionKey, input: unknown, setup = teamsSetup()) => {
  const r = validateSection(section, input, setup);
  return r.ok ? [] : r.errors.map((e) => e.field);
};

test("sections can be saved half-finished: missing isn't wrong", () => {
  assert.deepEqual(fields("players", { players: [] }), []);
  assert.deepEqual(fields("courses", { courses: [{ name: "Only a name" }] }), []);
  assert.deepEqual(fields("schedule", { rounds: [{ number: 1 }] }), []);
  assert.deepEqual(fields("basics", { name: "Cup", timezone: "America/Chicago", visibility: "private" }, createdSetup()), []);
});

test("basics: dates both-or-neither, in the edition's year, at most 14 days", () => {
  const base = { name: "Cup", timezone: "America/Chicago", visibility: "private" };
  assert.deepEqual(fields("basics", { ...base, startDate: "2027-04-15" }), ["startDate"]);
  assert.deepEqual(fields("basics", { ...base, startDate: "2028-04-15", endDate: "2028-04-17" }), ["startDate"]);
  assert.deepEqual(fields("basics", { ...base, startDate: "2027-04-01", endDate: "2027-04-30" }), ["endDate"]);
  assert.deepEqual(fields("basics", { ...base, timezone: "Mars/Base", visibility: "everyone" }).sort(), ["timezone", "visibility"]);
});

test("players: real emails, handicaps -10..54, only this tournament's teams, unique names, only existing ids", () => {
  assert.deepEqual(fields("players", { players: [{ name: "Ann", email: "nope" }] }), ["players.0.email"]);
  assert.deepEqual(fields("players", { players: [{ name: "Ann", handicap: 60 }] }), ["players.0.handicap"]);
  assert.deepEqual(fields("players", { players: [{ name: "Ann", teamKey: "red" }] }), ["players.0.teamKey"]);
  assert.deepEqual(fields("players", { players: [{ name: "Ann" }, { name: "ann" }] }), ["players"]);
  assert.deepEqual(fields("players", { players: [{ id: "someone-else", name: "Ann" }] }), ["players.0"]);
});

test("teams: 2-8 named teams with colors; a captain must be on that team; individual events have none", () => {
  assert.deepEqual(fields("teams", { competitionType: "teams", teams: [{ id: "a", name: "Blue", color: "#1f4e9c", captainPlayerId: "p2" }, { id: "b", name: "Gold", color: "#b8860b" }] }), ["teams.0.captainPlayerId"]);
  assert.deepEqual(fields("teams", { competitionType: "teams", teams: [{ name: "Solo", color: "#000000" }] }), ["teams"]);
  assert.deepEqual(fields("teams", { competitionType: "individual", teams: [{ name: "X", color: "#000000" }] }), ["teams"]);
  assert.deepEqual(fields("teams", { competitionType: "teams", teams: [{ name: "Blue", color: "blue" }, { name: "Gold", color: "#b8860b" }] }), ["teams.0.color"]);
});

test("rounds and schedule: registered formats, this tournament's courses, dates inside the tournament", () => {
  assert.deepEqual(fields("rounds", { rounds: [{ format: "Scramble" }] }), ["rounds.0.format"]);
  assert.deepEqual(fields("rounds", { rounds: [{ format: "Singles", courseId: "not-ours" }] }), ["rounds.0.courseId"]);
  assert.deepEqual(fields("rounds", { rounds: [{ day: 4, format: "Singles" }] }), ["rounds.0.day"]);
  assert.deepEqual(fields("rounds", { rounds: [] }), ["rounds"]);
  assert.deepEqual(fields("schedule", { rounds: [{ number: 1, playDate: "2027-05-01" }] }), ["rounds.0.playDate"]);
  assert.deepEqual(fields("schedule", { rounds: [{ number: 1, startTime: "8:30am" }] }), ["rounds.0.startTime"]);
  assert.deepEqual(fields("schedule", { rounds: [{ number: 9 }] }), ["rounds.0"]);
  assert.deepEqual(fields("schedule", { rounds: [{ number: 1, playDate: "2027-04-15" }] }, createdSetup()), ["rounds.0.playDate"], "no tournament dates yet");
});

test("rules reuse the shared scoring rules; branding needs hex colors and never keeps a logo URL; media links must be https", () => {
  assert.deepEqual(fields("rules", { mode: "match_play", pointsForWin: 1, pointsForHalve: 2 }), ["scoring.pointsForHalve"]);
  assert.deepEqual(fields("rules", { mode: "stroke_play", pointsForWin: 1, pointsForHalve: 0.5 }), ["scoring.mode"]);
  const branding = validateSection("branding", { primary: "#111111", secondary: "#ffffff", accent: "#cccccc", logoUrl: "https://x/y.png" }, teamsSetup());
  assert.ok(branding.ok && branding.data.logoUrl === null);
  assert.deepEqual(fields("media", { mode: "device_external", links: [{ label: "Clips", url: "http://insecure.example" }] }), ["links.0.url"]);
  assert.deepEqual(fields("media", { mode: "maroon_hosted" }), ["mode"]);
  const withEntitlement = teamsSetup();
  withEntitlement.entitlements = { hosted_media: true };
  assert.deepEqual(fields("media", { mode: "maroon_hosted" }, withEntitlement), []);
  const none = validateSection("media", { mode: "none", links: [{ label: "x", url: "https://x" }] }, teamsSetup());
  assert.ok(none.ok && Array.isArray(none.data.links) && none.data.links.length === 0, "links are dropped when media is off");
});
