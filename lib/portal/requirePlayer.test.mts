import { test } from "node:test";
import assert from "node:assert/strict";
import { playerProfiles, getPlayerFirstName } from "@/lib/data/players";
import { identityFromSlot } from "./requirePlayer";

test("player identity is canonical while legacy scoring receives a first-name display value", () => {
  for (const profile of playerProfiles) {
    assert.equal(profile.id, profile.slug);
    assert.equal(getPlayerFirstName(profile.slug), profile.fullName.split(" ")[0]);
  }
});

test("identityFromSlot uses the saved full name and its first word", () => {
  assert.deepEqual(identityFromSlot("john-smith", "John Smith"), {
    playerFullName: "John Smith",
    playerFirstName: "John",
  });
});

test("identityFromSlot trims surrounding whitespace", () => {
  assert.deepEqual(identityFromSlot("ada-lovelace", "  Ada Lovelace "), {
    playerFullName: "Ada Lovelace",
    playerFirstName: "Ada",
  });
});

test("identityFromSlot falls back to the slug when no full name is saved", () => {
  assert.deepEqual(identityFromSlot("john-smith", null), {
    playerFullName: "john-smith",
    playerFirstName: "john-smith",
  });
  assert.deepEqual(identityFromSlot("john-smith", "   "), {
    playerFullName: "john-smith",
    playerFirstName: "john-smith",
  });
});
