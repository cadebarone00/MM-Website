import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SAMPLE_PROFILE, sampleProfileReadModel } from "./sampleProfile";
import { DEFAULT_SIMULATOR_STATE, parseSimulatorConfig } from "./simulator";

const TODAY = "2026-10-15";

test("my sample profile: everything shows, with the edits applied", () => {
  const profile = sampleProfileReadModel("sample", { ...DEFAULT_SAMPLE_PROFILE, displayName: "Casey Green", bio: "New bio", visibility: "public" }, TODAY);
  assert.equal(profile.access, "owner");
  assert.equal(profile.isOwner, true);
  assert.equal(profile.identity.displayName, "Casey Green");
  assert.equal(profile.identity.bio, "New bio");
  assert.equal(profile.identity.canEditBio, true);
  assert.equal(profile.rounds.status === "ok" && profile.rounds.value.length, 25);
  assert.notEqual(profile.modernStats?.handicapIndex, null);
  // Golf trips are the owner's: one upcoming, one past.
  assert.ok(profile.trips.status === "ok");
  assert.equal(profile.trips.value.current.length, 1);
  assert.equal(profile.trips.value.past.length, 1);
  assert.equal(profile.tournaments.status === "ok" && profile.tournaments.value.length, 2);
});

test("not enough rounds: 2 counting rounds, no handicap yet", () => {
  const profile = sampleProfileReadModel("few", DEFAULT_SAMPLE_PROFILE, TODAY);
  assert.equal(profile.modernStats?.roundsPlayed, 2);
  assert.equal(profile.modernStats?.countingRounds, 2);
  assert.equal(profile.modernStats?.handicapIndex, null);
});

test("no rounds: an empty but whole profile", () => {
  const profile = sampleProfileReadModel("none", DEFAULT_SAMPLE_PROFILE, TODAY);
  assert.deepEqual(profile.rounds, { status: "ok", value: [] });
  assert.equal(profile.modernStats, null);
});

test("someone else's Public profile follows the live privacy rules: no golf trips, no editing", () => {
  const profile = sampleProfileReadModel("public", DEFAULT_SAMPLE_PROFILE, TODAY);
  assert.equal(profile.access, "public");
  assert.equal(profile.isOwner, false);
  assert.equal(profile.identity.username, "jakeparker");
  assert.equal(profile.identity.canEditBio, false);
  assert.deepEqual(profile.trips, { status: "hidden" });
  assert.equal(profile.rounds.status === "ok" && profile.rounds.value.length, 18);
});

test("someone else's Private profile: name and username only", () => {
  const profile = sampleProfileReadModel("private", DEFAULT_SAMPLE_PROFILE, TODAY);
  assert.equal(profile.access, "private");
  assert.equal(profile.identity.bio, null);
  assert.deepEqual([profile.rounds, profile.trips, profile.tournaments], [{ status: "hidden" }, { status: "hidden" }, { status: "hidden" }]);
  assert.equal(profile.modernStats, null);
});

test("the simulator accepts the profile previews and rejects anything else", () => {
  const config = (profilePreview: unknown) => parseSimulatorConfig({ source: "maroon", state: { ...DEFAULT_SIMULATOR_STATE, profilePreview } });
  for (const preview of ["sample", "few", "none", "public", "private"]) assert.equal(config(preview)?.state.profilePreview, preview);
  assert.equal(config("owner-of-everything"), null);
  assert.equal(parseSimulatorConfig({ source: "maroon", state: DEFAULT_SIMULATOR_STATE })?.state.profilePreview, undefined);
});
