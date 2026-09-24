// lib/data/players/overrides.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isEditableField, mergeProfile, EDITABLE_PLAYER_FIELDS } from "./overrides.ts";
import type { PlayerProfile } from "../types.ts";

test("isEditableField accepts every field in EDITABLE_PLAYER_FIELDS", () => {
  for (const field of EDITABLE_PLAYER_FIELDS) {
    assert.equal(isEditableField(field), true);
  }
});

test("isEditableField rejects structural fields and unknown strings", () => {
  assert.equal(isEditableField("id"), false);
  assert.equal(isEditableField("slug"), false);
  assert.equal(isEditableField("fullName"), false);
  assert.equal(isEditableField("notAField"), false);
});

test("mergeProfile overlays overrides on top of the base profile, leaving untouched fields alone", () => {
  const base: PlayerProfile = {
    id: "Test",
    slug: "test-player",
    fullName: "Test Player",
    avatarSrc: null,
    bio: "Original bio.",
    history: ["Debut 2024"],
    hometown: "Nowhere",
  };

  const merged = mergeProfile(base, { bio: "Updated bio.", hometown: "Somewhere" });

  assert.equal(merged.bio, "Updated bio.");
  assert.equal(merged.hometown, "Somewhere");
  assert.equal(merged.fullName, "Test Player");
  assert.deepEqual(merged.history, ["Debut 2024"]);
});

test("mergeProfile with no overrides returns the base profile's values unchanged", () => {
  const base: PlayerProfile = {
    id: "Test",
    slug: "test-player",
    fullName: "Test Player",
    avatarSrc: null,
    bio: "Original bio.",
    history: [],
  };

  const merged = mergeProfile(base, {});
  assert.deepEqual(merged, base);
});
