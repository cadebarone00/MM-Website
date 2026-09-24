import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultTeamName, sanitizeTeamName } from "./teamName.ts";

test("sanitizeTeamName trims whitespace", () => {
  assert.equal(sanitizeTeamName("  The Champs  "), "The Champs");
});

test("sanitizeTeamName turns a blank or whitespace-only entry into null", () => {
  assert.equal(sanitizeTeamName(""), null);
  assert.equal(sanitizeTeamName("   "), null);
});

test("sanitizeTeamName rejects non-strings", () => {
  assert.equal(sanitizeTeamName(undefined), null);
  assert.equal(sanitizeTeamName(null), null);
  assert.equal(sanitizeTeamName(42), null);
});

test("sanitizeTeamName caps length at 40 characters", () => {
  const long = "x".repeat(60);
  assert.equal(sanitizeTeamName(long), "x".repeat(40));
});

test("defaultTeamName is possessive on the person's display name", () => {
  assert.equal(defaultTeamName("Cade Barone"), "Cade Barone's Team");
});
