import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTIONS } from "./ProfileEditGrid.tsx";
import { EDITABLE_PLAYER_FIELDS } from "../../lib/data/players/overrides.ts";

test("ProfileEditGrid's SECTIONS covers exactly the editable-field allowlist, once each", () => {
  const sectionKeys = SECTIONS.flatMap((s) => s.fields.map((f) => f.key as string));
  assert.deepEqual(new Set(sectionKeys), new Set(EDITABLE_PLAYER_FIELDS));
  assert.equal(sectionKeys.length, new Set(sectionKeys).size, "a field key appears in more than one section");
  assert.equal(sectionKeys.length, EDITABLE_PLAYER_FIELDS.length);
});
