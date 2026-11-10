import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMAT_NAMES } from "./savedTripSetup.ts";
import { MAROON_ROUND_ORDER, TRIP_FORMAT_PRESETS, presetById } from "./tripFormatPresets.ts";

test("exactly The Maroon Style (Both), Individual and Team, in that order", () => {
  assert.deepEqual(TRIP_FORMAT_PRESETS.map(p => p.id), ["maroon", "individual", "team"]);
  assert.equal(presetById("maroon")?.label, "Both");
  assert.equal(presetById("nope"), null);
});

test("every preset gives a real format for 1–12 rounds", () => {
  for (const preset of TRIP_FORMAT_PRESETS) for (let count = 1; count <= 12; count++) for (let i = 0; i < count; i++) {
    assert.ok((FORMAT_NAMES as readonly string[]).includes(preset.formatForRound(i, count)), `${preset.id} ${i}/${count}`);
  }
});

test("The Maroon Style: 8 rounds = 3 Fourball, 3 Singles, 2 Alt Shot in the owner's order", () => {
  const maroon = presetById("maroon")!;
  const eight = Array.from({ length: 8 }, (_, i) => maroon.formatForRound(i, 8));
  assert.deepEqual(eight, [...MAROON_ROUND_ORDER]);
  assert.deepEqual(eight, ["Fourball", "Alternate Shot", "Fourball", "Singles", "Alternate Shot", "Fourball", "Singles", "Singles"]);
  assert.equal(maroon.tag, "8 rounds · 3 Fourball · 3 Singles · 2 Alt Shot");
  assert.equal(maroon.formatForRound(9, 10), "Singles", "past 8 rounds: Singles");
  assert.deepEqual(Array.from({ length: 3 }, (_, i) => maroon.formatForRound(i, 3)), ["Fourball", "Alternate Shot", "Fourball"]);
});

test("competition types: Both has both, Individual has no team, Team has no individual", () => {
  const [maroon, individual, team] = TRIP_FORMAT_PRESETS;
  assert.ok(maroon.types.individual && maroon.types.team);
  assert.equal(individual.types.team, null);
  assert.equal(team.types.individual, null);
  assert.equal(team.formatForRound(0, 4), "Fourball");
  assert.equal(individual.formatForRound(0, 4), "Stroke Play");
});
