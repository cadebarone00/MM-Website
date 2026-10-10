import { test } from "node:test";
import assert from "node:assert/strict";
import {
  careerStats, initialsFor, memberSinceLabel, playerFullName, profileDisplayName,
} from "./myProfile";

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

test("career stats: a row per year played (oldest first), every stat column, then totals; null when there are none", () => {
  const y2024 = { scoringAverage: 82.5, teamPointsWon: 3, totalEarned: 120, totalSkins: 2, girPct: 40, oneJacks: { total: 5, pct: 10 } };
  const y2026 = { scoringAverage: 80, teamPointsWon: 1.5, totalEarned: 40.5, oneJacks: { total: 4 } };
  const stats = careerStats([
    { year: 2026, stats: y2026 },
    { year: 2025, stats: null },
    { year: 2024, stats: y2024 },
  ])!;
  assert.equal(stats.columns.length, 23);
  assert.deepEqual(stats.columns.slice(0, 4), ["Scoring Average", "Team Points Won", "Total Earned", "Total Skins"]);
  const col = (label: string) => stats.columns.indexOf(label);
  assert.deepEqual(stats.rows.map((r) => [r.year, r.event]), [[2024, "The Maroon Tournament"], [2026, "The Maroon Tournament"]]);
  assert.deepEqual(stats.rows.map((r) => r.values[col("Scoring Average")]), ["82.5", "80"]);
  assert.deepEqual(stats.rows.map((r) => r.values[col("Total Skins")]), ["2", null]);
  assert.deepEqual(stats.rows.map((r) => r.values[col("GIR %")]), ["40%", null]);
  assert.deepEqual(stats.rows.map((r) => r.values[col("Total 1-Putts")]), ["5 (10%)", "4"]);
  // Counts add up; averages and percentages have no total.
  assert.equal(stats.totals[col("Team Points Won")], "4.5");
  assert.equal(stats.totals[col("Total Earned")], "$160.50");
  assert.equal(stats.totals[col("Total Skins")], "2");
  assert.equal(stats.totals[col("Total 1-Putts")], "9");
  assert.equal(stats.totals[col("Scoring Average")], null);
  assert.equal(stats.totals[col("GIR %")], null);
  assert.deepEqual(stats.played.map((y) => y.year), [2024, 2026]);
  assert.equal(careerStats([{ year: 2024, stats: null }]), null);
  assert.equal(careerStats([]), null);
});

test("player name: a blank saved name falls back to the hand-written one", () => {
  assert.equal(playerFullName("Cade B.", "Cade Barone"), "Cade B.");
  assert.equal(playerFullName("   ", "Cade Barone"), "Cade Barone");
  assert.equal(playerFullName(null, "Cade Barone"), "Cade Barone");
  assert.equal(playerFullName("", undefined), null);
});
