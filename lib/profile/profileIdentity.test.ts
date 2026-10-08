import assert from "node:assert/strict";
import test from "node:test";
import { profileIdentityFromRow } from "./profileIdentity";

test("a profile row becomes the golfer's identity; the Maroon slot is only an optional legacy mapping", () => {
  const id = "4f1c2a8e-0000-4000-8000-000000000001";
  assert.deepEqual(profileIdentityFromRow({ id, display_name: "Cade Barone", username: "MMCADBAR", email: "cade@test", player_slug: "cade-barone" }), {
    profileId: id, displayName: "Cade Barone", username: "MMCADBAR", email: "cade@test", legacyMaroonPlayerSlug: "cade-barone",
  });
  assert.equal(profileIdentityFromRow({ id, display_name: "Guest", username: "golfer_1", email: "g@test", player_slug: null })?.legacyMaroonPlayerSlug, null);
});

test("no row, or a row without an id, is no profile", () => {
  assert.equal(profileIdentityFromRow(null), null);
  assert.equal(profileIdentityFromRow({ display_name: "x" }), null);
});
