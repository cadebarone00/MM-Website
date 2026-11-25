import assert from "node:assert/strict";
import test from "node:test";
import { predictSettingsFrom, tripGamesGroup } from "./tripHome";

test("Games group: my scoring group today, else everyone who accepted; invited or left-out players never included", () => {
  const member = (profileId: string | null, displayName: string, invitationStatus = "accepted") => ({ profileId, displayName, invitationStatus }) as never;
  const members = [member("me", "Cam"), member("a", "Ann"), member("b", "Bo"), member("c", "Cy", "invited"), member(null, "Guest")];
  assert.deepEqual(tripGamesGroup(members, undefined, "me").map((p) => p.name), ["Cam", "Ann", "Bo"]);
  const groups = [{ players: [{ profileId: "me" }, { profileId: "b" }] }, { players: [{ profileId: "a" }] }];
  assert.deepEqual(tripGamesGroup(members, groups, "me").map((p) => p.name), ["Cam", "Bo"]);
});

test("Predict settings come from the trip's saved settings: on unless switched off", () => {
  assert.deepEqual(predictSettingsFrom({}), { on: true, off: [] });
  assert.deepEqual(predictSettingsFrom({ predictSettings: { on: false, off: ["holeInOne", 3] } }), { on: false, off: ["holeInOne"] });
});
