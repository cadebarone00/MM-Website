/// <reference types="node" />
// Proves the app runs the website's own lib/ code (docs/architecture/app-first.md rule 13: same brain, same results).
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialsFor } from "@/lib/profile/initials";
import { joinPath } from "@/lib/platform/codeInvites";
import { formatCode } from "@/lib/platform/codeTournaments";
import { roundStats } from "@/lib/profile/roundStats";

test("initials come from the shared lib", () => {
  assert.equal(initialsFor("Cade Barone"), "CB");
  assert.equal(initialsFor("  cam  "), "C");
  assert.equal(initialsFor("Mary Jo Smith"), "MJ");
  assert.equal(initialsFor(""), "?");
});

test("invite codes format and link the same as the website", () => {
  assert.equal(joinPath("round", "ABC234"), "/rounds/join?code=ABC234");
  assert.equal(formatCode("ABC234"), "ABC-234");
});

test("round stats run from the shared lib", () => {
  assert.doesNotThrow(() => roundStats([]));
});
