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
