import { test } from "node:test";
import assert from "node:assert/strict";
import { playerProfiles, getPlayerFirstName } from "@/lib/data/players";

test("player identity is canonical while legacy scoring receives a first-name display value", () => {
  for (const profile of playerProfiles) {
    assert.equal(profile.id, profile.slug);
    assert.equal(getPlayerFirstName(profile.slug), profile.fullName.split(" ")[0]);
  }
});
