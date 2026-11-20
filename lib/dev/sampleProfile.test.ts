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

test("someone else's Private profile: the whole top (bio + socials too), none of the bottom", () => {
  const profile = sampleProfileReadModel("private", DEFAULT_SAMPLE_PROFILE, TODAY);
  assert.equal(profile.access, "private");
  assert.ok(profile.identity.bio, "the bio shows");
  assert.equal(profile.identity.links.length, 1, "the socials show");
  assert.deepEqual([profile.rounds, profile.trips, profile.tournaments], [{ status: "hidden" }, { status: "hidden" }, { status: "hidden" }]);
  // Only the counts show (rounds played, handicap index), never averages or bests.
  assert.deepEqual(profile.modernStats && [profile.modernStats.average18, profile.modernStats.best18], [null, null]);
});

test("the simulator accepts the profile previews and rejects anything else", () => {
  const config = (profilePreview: unknown) => parseSimulatorConfig({ source: "maroon", state: { ...DEFAULT_SIMULATOR_STATE, profilePreview } });
  for (const preview of ["sample", "few", "none", "public", "private"]) assert.equal(config(preview)?.state.profilePreview, preview);
  assert.equal(config("owner-of-everything"), null);
  assert.equal(parseSimulatorConfig({ source: "maroon", state: DEFAULT_SIMULATOR_STATE })?.state.profilePreview, undefined);
});

test("the simulator accepts the profile search states and rejects anything else", () => {
  const config = (profileSearch: unknown) => parseSimulatorConfig({ source: "maroon", state: { ...DEFAULT_SIMULATOR_STATE, profileSearch } });
  for (const state of ["empty", "results", "none"]) assert.equal(config(state)?.state.profileSearch, state);
  assert.equal(config("open"), null);
});

test("sample golfers open by username: Public ones whole, Private ones top only", () => {
  const sarah = sampleProfileReadModel("sample", DEFAULT_SAMPLE_PROFILE, TODAY, "sarahlopez");
  assert.deepEqual([sarah.access, sarah.identity.displayName, sarah.rounds.status], ["public", "Sarah Lopez", "ok"]);
  const tom = sampleProfileReadModel("sample", DEFAULT_SAMPLE_PROFILE, TODAY, "tomreed");
  assert.deepEqual([tom.access, tom.rounds.status], ["private", "hidden"]);
  assert.equal(sampleProfileReadModel("sample", DEFAULT_SAMPLE_PROFILE, TODAY, "nobody").isOwner, true, "unknown username = my own sample profile");
});

test("the simulator accepts the phone keyboard setting (iOS / Android / off) and rejects anything else", () => {
  const config = (keyboard: unknown) => parseSimulatorConfig({ source: "maroon", state: { ...DEFAULT_SIMULATOR_STATE, keyboard } });
  for (const kind of ["ios", "android", "off"]) assert.equal(config(kind)?.state.keyboard, kind);
  assert.equal(config("windows"), null);
});
