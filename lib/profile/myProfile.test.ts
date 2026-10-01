import { test } from "node:test";
import assert from "node:assert/strict";
import type { Tournament } from "../data/types";
import {
  careerStats, initialsFor, maroonYearsPlayed, memberSinceLabel, mergeCompleted, profileDisplayName, teamsPlayed,
} from "./myProfile";

const year = (y: number, slug: string, maroon: string[], white: string[]) =>
  ({ slug, year: y, location: `Place ${y}`, startDate: `${y}-01-09`, endDate: `${y}-01-12`, roster: { maroon, white } }) as unknown as Tournament;
const FIXTURE = [year(2024, "2024-a", ["cam-latto"], ["cade-barone"]), year(2025, "2025-b", ["cade-barone"], []), year(2026, "2026-c", ["cam-latto"], [])];

test("name: first non-blank of full name, display name, username, email prefix", () => {
  assert.equal(profileDisplayName({ fullName: "Cade Barone", displayName: "cb", username: "u", email: "x@y.z" }), "Cade Barone");
  assert.equal(profileDisplayName({ fullName: "  ", displayName: "Fan Person", email: "x@y.z" }), "Fan Person");
  assert.equal(profileDisplayName({ username: "fan99", email: "x@y.z" }), "fan99");
  assert.equal(profileDisplayName({ email: "cadebarone@example.com" }), "cadebarone");
  assert.equal(profileDisplayName({}), "Golfer");
});

test("initials: up to two letters, uppercase", () => {
  assert.equal(initialsFor("Cade Barone"), "CB");
  assert.equal(initialsFor("cadebarone"), "C");
  assert.equal(initialsFor("Mary Ann Van Dyke"), "MA");
  assert.equal(initialsFor("   "), "?");
});

test("member since: short date, or null when missing or invalid", () => {
  assert.equal(memberSinceLabel("2023-08-26T15:00:00Z"), "Aug 26, 2023");
  assert.equal(memberSinceLabel(undefined), null);
  assert.equal(memberSinceLabel("not a date"), null);
});

test("Maroon years: only years the player is on either roster, newest first", () => {
  assert.deepEqual(maroonYearsPlayed("cade-barone", FIXTURE), [
    { name: "The Maroon Tournament", year: 2025, destination: "Place 2025", startDate: "2025-01-09", endDate: "2025-01-12", href: "/leaderboard/2025-b" },
    { name: "The Maroon Tournament", year: 2024, destination: "Place 2024", startDate: "2024-01-09", endDate: "2024-01-12", href: "/leaderboard/2024-a" },
  ]);
  assert.deepEqual(maroonYearsPlayed(null, FIXTURE), []);
  assert.deepEqual(maroonYearsPlayed("nobody", FIXTURE), []);
});

test("teams: each team played on, Maroon before White", () => {
  assert.deepEqual(teamsPlayed("cade-barone", FIXTURE), ["maroon", "white"]);
  assert.deepEqual(teamsPlayed("cam-latto", FIXTURE), ["maroon"]);
  assert.deepEqual(teamsPlayed(null, FIXTURE), []);
});

test("completed: Maroon years win over the platform's legacy copy of the same year; newest first", () => {
  const maroon = maroonYearsPlayed("cade-barone", FIXTURE);
  const platform = [
    { name: "The Maroon Tournament", year: 2025, destination: null, startDate: null, endDate: null, href: "/website" },
    { name: "Texas Cup", year: 2026, destination: "Austin", startDate: "2026-05-01", endDate: "2026-05-03", href: "/t/texas-cup/2026" },
    { name: "The Maroon Tournament", year: 2023, destination: null, startDate: null, endDate: null, href: "/website" },
  ];
  assert.deepEqual(mergeCompleted(maroon, platform).map((t) => `${t.name} ${t.year} ${t.href}`), [
    "Texas Cup 2026 /t/texas-cup/2026",
    "The Maroon Tournament 2025 /leaderboard/2025-b",
    "The Maroon Tournament 2024 /leaderboard/2024-a",
    "The Maroon Tournament 2023 /website",
  ]);
  assert.deepEqual(mergeCompleted([], []), []);
});

test("career stats: four headline rows with totals; null when there are none", () => {
  const stats = careerStats([
    { year: 2024, stats: { scoringAverage: 82.5, teamPointsWon: 3, totalEarned: 120, totalSkins: 2 } },
    { year: 2025, stats: null },
    { year: 2026, stats: { scoringAverage: 80, teamPointsWon: 1.5, totalEarned: 40.5 } },
  ]);
  assert.deepEqual(stats, {
    years: [2024, 2025, 2026],
    rows: [
      { label: "Scoring Average", values: ["82.5", null, "80"], careerTotal: null },
      { label: "Team Points Won", values: ["3", null, "1.5"], careerTotal: "4.5" },
      { label: "Total Earned", values: ["$120.00", null, "$40.50"], careerTotal: "$160.50" },
      { label: "Total Skins", values: ["2", null, null], careerTotal: "2" },
    ],
  });
  assert.equal(careerStats([{ year: 2024, stats: null }]), null);
  assert.equal(careerStats([]), null);
});
