import { test } from "node:test";
import assert from "node:assert/strict";
import { canShareLiveLink, liveSettingsFrom, liveSettingsFromBody } from "./liveVisibility.ts";

test("saved settings are read as saved; missing ones fall back (database not updated yet)", () => {
  assert.deepEqual(liveSettingsFrom("public", false, "link"), { visibility: "public", playersCanShare: false });
  assert.deepEqual(liveSettingsFrom(undefined, undefined, "link"), { visibility: "link", playersCanShare: true });
  assert.deepEqual(liveSettingsFrom("everyone", null, "private"), { visibility: "private", playersCanShare: true });
});

test("Private never shares; players share only when the organizer allows it; organizers always can otherwise", () => {
  for (const isOrganizer of [true, false]) assert.equal(canShareLiveLink({ visibility: "private", playersCanShare: true }, isOrganizer), false);
  assert.equal(canShareLiveLink({ visibility: "link", playersCanShare: false }, true), true);
  assert.equal(canShareLiveLink({ visibility: "link", playersCanShare: false }, false), false);
  assert.equal(canShareLiveLink({ visibility: "public", playersCanShare: true }, false), true);
});

test("a PATCH body needs a real choice and a yes / no", () => {
  assert.deepEqual(liveSettingsFromBody({ visibility: "link", playersCanShare: false }), { ok: true, settings: { visibility: "link", playersCanShare: false } });
  assert.equal(liveSettingsFromBody({ visibility: "unlisted", playersCanShare: true }).ok, false);
  assert.equal(liveSettingsFromBody({ visibility: "public" }).ok, false);
  assert.equal(liveSettingsFromBody(null).ok, false);
});
