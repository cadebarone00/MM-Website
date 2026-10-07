import { test } from "node:test";
import assert from "node:assert/strict";
import { golfSections } from "./golfTripNavigation.ts";

const tabs = (individual: boolean, team: boolean) => golfSections({ individual, team }).map(({ id, label }) => `${id}:${label}`);

test("Golf sections follow the competition", () => {
  assert.deepEqual(tabs(false, false), ["Overview:Overview", "Games:Games"]);
  assert.deepEqual(tabs(true, false), ["Overview:Leaderboard", "Games:Games"]);
  assert.deepEqual(tabs(false, true), ["Competition:Matches", "Games:Games"]);
  assert.deepEqual(tabs(true, true), ["Overview:Leaderboard", "Competition:Matches", "Games:Games"]);
});

test("Player Stats on adds Stats after Games", () => {
  assert.deepEqual(golfSections({ individual: true, team: true }, true).map(({ label }) => label), ["Leaderboard", "Matches", "Games", "Stats"]);
  assert.deepEqual(golfSections({ individual: false, team: false }, true).map(({ label }) => label), ["Overview", "Games", "Stats"]);
  assert.deepEqual(golfSections({ individual: false, team: true }).map(({ label }) => label), ["Matches", "Games"]);
});
