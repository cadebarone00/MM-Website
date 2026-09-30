import { test } from "node:test";
import assert from "node:assert/strict";
import { palmSprings2026 } from "@/lib/data/2026-palm-springs";
import { tournamentRoundSequence } from "@/lib/data/tournamentRoundSequence";
import { matchesPerSession, playersPerTeamPerMatch } from "@/lib/live/orchestration";
import { teeTimeSlotForMatch } from "@/lib/live/sessionTeeTimes";
import { FORMATS, FORMAT_KEYS, matchesPerRound, matchesPerTeeTime, teeTimesPerRound } from "./formats.ts";
import { summarizeStructure, validateTournamentConfig, type TournamentConfig } from "./tournamentConfig.ts";

const WIZARD_FORMAT: Record<string, string> = { Fourball: "Fourball", "Alt Shot": "Foursome", Singles: "Singles" };

/** The Maroon Tournament's real 2026 edition, expressed as wizard input. */
function maroon2026Input() {
  const t = palmSprings2026;
  return {
    basics: { name: "The Maroon Tournament", shortName: "The Maroon", slug: "the-maroon-tournament", description: null, destination: t.venue, startDate: t.startDate, endDate: t.endDate, timezone: "America/Los_Angeles", visibility: "public" },
    branding: { primary: "#500001", secondary: "#fbf8f1", accent: "#b8945a", logoUrl: null },
    teams: [
      { key: "maroon", name: "Team Maroon", color: "#500001", captainPlayerKey: null },
      { key: "white", name: "Team White", color: "#fbf8f1", captainPlayerKey: null },
    ],
    players: [
      ...t.roster.maroon.map((slug) => ({ key: slug, name: slug, email: null, handicap: null, teamKey: "maroon" })),
      ...t.roster.white.map((slug) => ({ key: slug, name: slug, email: null, handicap: null, teamKey: "white" })),
    ],
    rounds: tournamentRoundSequence(t).map((m) => ({ day: m.day, label: m.session, format: WIZARD_FORMAT[m.format], courseId: null })),
    scoring: { mode: "match_play", pointsForWin: 1, pointsForHalve: 0.5, handicap: "gross", allowancePercent: 100 },
  };
}

/** Wizard input as a browser would send it — loose on purpose so tests can send bad values. */
interface WizardInput {
  basics: Record<string, string | null>;
  branding: Record<string, string | null>;
  teams: { key: string; name: string; color: string; captainPlayerKey: string | null }[];
  players: { key: string; name: string; email: string | null; handicap: number | null; teamKey: string | null }[];
  rounds: { day: number; label: string | null; format: string; courseId: string | null }[];
  scoring: Record<string, string | number>;
}

/** A completely different tournament: 16 players, Blue vs Gold, 3 days. */
function texasCupInput(): WizardInput {
  const players = Array.from({ length: 16 }, (_, i) => ({
    key: `golfer-${i + 1}`,
    name: `Golfer ${i + 1}`,
    email: `golfer${i + 1}@example.com`,
    handicap: i,
    teamKey: i < 8 ? "blue" : "gold",
  }));
  return {
    basics: { name: "Texas Cup", shortName: "Texas Cup", slug: "texas-cup", description: "Blue vs Gold in the Hill Country.", destination: "Horseshoe Bay, TX", startDate: "2027-04-15", endDate: "2027-04-17", timezone: "America/Chicago", visibility: "public" },
    branding: { primary: "#1f4e9c", secondary: "#ffffff", accent: "#d4a017", logoUrl: null },
    teams: [
      { key: "blue", name: "Blue Team", color: "#1f4e9c", captainPlayerKey: "golfer-1" },
      { key: "gold", name: "Gold Team", color: "#d4a017", captainPlayerKey: "golfer-9" },
    ],
    players,
    rounds: [
      { day: 1, label: "Morning", format: "Fourball", courseId: null },
      { day: 1, label: "Afternoon", format: "Foursome", courseId: null },
      { day: 2, label: "Morning", format: "Fourball", courseId: null },
      { day: 2, label: "Afternoon", format: "Foursome", courseId: null },
      { day: 3, label: null, format: "Singles", courseId: null },
    ],
    scoring: { mode: "match_play", pointsForWin: 1, pointsForHalve: 0.5, handicap: "net", allowancePercent: 85 },
  };
}

function valid(input: unknown): TournamentConfig {
  const result = validateTournamentConfig(input);
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.errors));
  return (result as { ok: true; config: TournamentConfig }).config;
}

function errorFields(input: unknown): string[] {
  const result = validateTournamentConfig(input);
  assert.equal(result.ok, false);
  return (result as { ok: false; errors: { field: string }[] }).errors.map((e) => e.field);
}

test("format registry reproduces today's hard-coded 6-a-side numbers exactly", () => {
  for (const format of FORMAT_KEYS) {
    assert.equal(matchesPerRound(format, 6), matchesPerSession(format), format);
    assert.equal(FORMATS[format].playersPerSide, playersPerTeamPerMatch(format), format);
    assert.equal(teeTimesPerRound(format, 6), 3, format);
    for (let match = 1; match <= matchesPerRound(format, 6); match++) {
      assert.equal(Math.floor((match - 1) / matchesPerTeeTime(format)), teeTimeSlotForMatch(format, match), `${format} match ${match}`);
    }
  }
});

test("The Maroon Tournament's real 2026 edition fits the platform model with its real points", () => {
  const config = valid(maroon2026Input());
  assert.equal(config.players.length, 12);
  assert.equal(config.rounds.length, 8);
  const summary = summarizeStructure(config);
  assert.equal(summary.pointsAvailable, palmSprings2026.pointsAvailable);
  assert.equal(summary.pointsToWin, palmSprings2026.pointsToWin);
  assert.equal(summary.pointsAvailable, palmSprings2026.matches.length);
});

test("a completely different Texas Cup (16 players, Blue vs Gold, 3 days) validates with no code changes", () => {
  const config = valid(texasCupInput());
  assert.deepEqual(config.teams.map((t) => t.name), ["Blue Team", "Gold Team"]);
  const summary = summarizeStructure(config);
  assert.deepEqual(summary.rounds.map((r) => [r.format, r.matches, r.teeTimes]), [
    ["Fourball", 4, 4], ["Foursome", 4, 4], ["Fourball", 4, 4], ["Foursome", 4, 4], ["Singles", 8, 4],
  ]);
  assert.equal(summary.pointsAvailable, 24);
  assert.equal(summary.pointsToWin, 12.5);
  assert.equal(config.scoring.handicap, "net");
  assert.equal(config.scoring.allowancePercent, 85);
});

test("rejects bad basics: reserved or malformed slug, reversed dates, bad timezone, bad colors", () => {
  const input = texasCupInput();
  input.basics = { ...input.basics, slug: "Texas Cup!", endDate: "2027-04-10", timezone: "Mars/Olympus" };
  input.branding = { ...input.branding, accent: "gold" };
  assert.deepEqual(errorFields(input).sort(), ["basics.endDate", "basics.slug", "basics.timezone", "branding.accent"]);
  const reserved = texasCupInput();
  reserved.basics.slug = "admin";
  assert.deepEqual(errorFields(reserved), ["basics.slug"]);
  const fakeDate = texasCupInput();
  fakeDate.basics.startDate = "2027-02-30";
  assert.ok(errorFields(fakeDate).includes("basics.startDate"));
});

test("rejects team problems: one team, duplicate names, player on an unknown team, captain on the wrong team", () => {
  const one = texasCupInput();
  one.teams = [one.teams[0]];
  assert.ok(errorFields(one).includes("teams"));

  const dupes = texasCupInput();
  dupes.teams[1] = { ...dupes.teams[1], name: "blue team" };
  assert.ok(errorFields(dupes).includes("teams"));

  const stray = texasCupInput();
  stray.players[0] = { ...stray.players[0], teamKey: "red" };
  assert.ok(errorFields(stray).includes("players.0.teamKey"));

  const captain = texasCupInput();
  captain.teams[0] = { ...captain.teams[0], captainPlayerKey: "golfer-16" };
  assert.deepEqual(errorFields(captain), ["teams.0.captainPlayerKey"]);
});

test("rejects player and round problems: bad email/handicap, duplicate ids, unknown format, day past the end", () => {
  const input = texasCupInput();
  input.players[2] = { ...input.players[2], email: "not-an-email", handicap: 80 };
  input.players[3] = { ...input.players[3], key: "golfer-1" };
  input.rounds[0] = { ...input.rounds[0], format: "Scramble" };
  input.rounds[4] = { ...input.rounds[4], day: 4 };
  assert.deepEqual(errorFields(input).sort(), ["players", "players.2.email", "players.2.handicap", "rounds.0.format", "rounds.4.day"]);
});

test("rejects a pairs format when a team is too small to field one pair", () => {
  const input = texasCupInput();
  input.players = [
    { key: "a", name: "A", email: null, handicap: null, teamKey: "blue" },
    { key: "b", name: "B", email: null, handicap: null, teamKey: "gold" },
  ];
  input.teams = input.teams.map((t) => ({ ...t, captainPlayerKey: null }));
  input.rounds = [{ day: 1, label: null, format: "Fourball", courseId: null }];
  assert.deepEqual(errorFields(input), ["rounds.0.format"]);
});

test("rejects unsupported scoring and never trusts missing input", () => {
  const input = texasCupInput();
  input.scoring = { ...input.scoring, mode: "stroke_play", pointsForHalve: 2 };
  assert.deepEqual(errorFields(input).sort(), ["scoring.mode", "scoring.pointsForHalve"]);
  for (const junk of [null, undefined, 42, "x", {}]) assert.equal(validateTournamentConfig(junk).ok, false);
});
