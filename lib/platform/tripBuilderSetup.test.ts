import { test } from "node:test";
import assert from "node:assert/strict";
import { validSetup } from "./savedTripSetup.ts";
import { tripBuilderSetupValues } from "./tripBuilderSetup.ts";
import { presetById } from "./tripFormatPresets.ts";

const draft = (extra: Record<string, string>) => ({
  tripName: "Bandon 2027", destination: "Bandon, OR", startDate: "2027-10-14", endDate: "2027-10-17", playerCount: "8",
  golfDays: "2", day1Date: "2027-10-14", day1Rounds: "2", day2Date: "2027-10-16", day2Rounds: "1", ...extra,
});

test("not competing → nothing to save", () => {
  assert.equal(tripBuilderSetupValues(draft({ competing: "no" })), null);
  assert.equal(tripBuilderSetupValues(draft({ competing: "" })), null);
});

test("Both (The Maroon Style) saves both competition types and a format per round, keyed like Settings", () => {
  const values = tripBuilderSetupValues(draft({ competing: "yes", formatPreset: "maroon" }))!;
  assert.equal(validSetup(values), true);
  assert.deepEqual(values.localCompetitionType, presetById("maroon")!.types);
  const formats = values.compFormats as Record<string, { format: string; matchType: string; players: number }>;
  // Day keys count from the trip's first day: Oct 14 = day 0 (2 rounds), Oct 16 = day 2.
  assert.deepEqual(Object.keys(formats).sort(), ["0-0", "0-1", "2-0"]);
  assert.deepEqual([formats["0-0"].format, formats["0-1"].format, formats["2-0"].format], ["Fourball", "Alternate Shot", "Fourball"]);
  assert.equal(formats["0-0"].matchType, "Match Play");
  assert.equal(formats["0-0"].players, 8);
  assert.deepEqual(values.roundsPerDay, { 0: 2, 1: 0, 2: 1, 3: 0 });
  assert.equal(values.dayCount, 4);
  assert.equal(values.playerTotal, 8);
});

test("Individual saves the type only (no team formats)", () => {
  const values = tripBuilderSetupValues(draft({ competing: "yes", formatPreset: "individual" }))!;
  assert.equal(validSetup(values), true);
  assert.deepEqual(values.localCompetitionType, { individual: "Stroke Play", team: null });
  assert.equal(values.compFormats, undefined);
});

test("team structure picks Pairs", () => {
  const values = tripBuilderSetupValues(draft({ competing: "yes", formatPreset: "team", teamStructure: "pairs" }))!;
  assert.equal((values.localCompetitionType as { team: string }).team, "Pairs");
});

test("Create Your Own: picked rounds are saved, Decide later rounds are left out", () => {
  const values = tripBuilderSetupValues(draft({ competing: "yes", formatPreset: "custom", round2Format: "Scramble", round1Format: "" }))!;
  assert.equal(validSetup(values), true);
  const formats = values.compFormats as Record<string, { format: string }>;
  assert.deepEqual(Object.keys(formats), ["0-1"]);
  assert.equal(formats["0-1"].format, "Scramble");
});

test("competing with no format picked still saves the competition type", () => {
  const values = tripBuilderSetupValues(draft({ competing: "yes", teamStructure: "two-teams" }))!;
  assert.equal(validSetup(values), true);
  assert.equal((values.localCompetitionType as { team: string }).team, "2 Teams");
});
