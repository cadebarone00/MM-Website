import { test } from "node:test";
import assert from "node:assert/strict";
import { websitePlayerIdentity } from "./playerIdentity";

test("signed out has no website identity; incomplete profiles never acquire fixture identity", () => {
  assert.equal(websitePlayerIdentity({ status: "signed-out" }), null);
  assert.deepEqual(websitePlayerIdentity({ status: "no-profile" }), { complete: false, displayName: "", username: "" });
  assert.deepEqual(websitePlayerIdentity({ status: "incomplete", displayName: null }), { complete: false, displayName: "", username: "" });
});
test("the website receives only basic real profile fields, never IDs/email/tokens/history", () => {
  const source = { status: "ok" as const, profile: { displayName: "Test Player", username: "testplayer", profileId: "secret-id", email: "private@example.invalid", legacyMaroonPlayerSlug: "legacy" }, account: { access_token: "secret" } };
  assert.deepEqual(websitePlayerIdentity(source), { complete: true, displayName: "Test Player", username: "testplayer" });
});
