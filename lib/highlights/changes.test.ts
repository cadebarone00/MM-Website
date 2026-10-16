import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyChanges } from "./changes.ts";
import { importHighlightSheet } from "./importer.ts";
import { validSheet } from "./sheetFixture.ts";
import type { HighlightConfig } from "./types.ts";

const published = () => importHighlightSheet(validSheet()).config;
function draftWith(edit: (config: HighlightConfig) => void) { const config = published(); edit(config); return config; }
const birdies = (config: HighlightConfig) => config.rules.find((r) => r.id === "HL-001")!;
const summary = (draft: HighlightConfig) => {
  const { kind, changes } = classifyChanges(published(), draft);
  return { kind, changes: changes.map((c) => `${c.kind}:${c.id}:${c.field}`) };
};

test("no edits → none", () => {
  assert.deepEqual(summary(published()), { kind: "none", changes: [] });
});

test("headline or body wording → copy, with before/after", () => {
  const draft = draftWith((c) => { birdies(c).conditionals[0].headline = "{player} is cooking! 🔥"; birdies(c).conditionals[1].body = "Four straight."; });
  assert.deepEqual(summary(draft), { kind: "copy", changes: ["copy:HL-001-C01:headline", "copy:HL-001-C02:body"] });
  assert.deepEqual(classifyChanges(published(), draft).changes[0], { kind: "copy", id: "HL-001-C01", field: "headline", before: "{player}'s heating up! 🔥", after: "{player} is cooking! 🔥" });
});

test("tier change, disabling or approving → behavior", () => {
  assert.deepEqual(summary(draftWith((c) => { birdies(c).conditionals[7].tier = 9; })), { kind: "behavior", changes: ["behavior:HL-001-C08:tier"] });
  assert.deepEqual(summary(draftWith((c) => { birdies(c).conditionals[7].status = "Disabled"; })), { kind: "behavior", changes: ["behavior:HL-001-C08:removed"] });
  assert.deepEqual(summary(draftWith((c) => { birdies(c).status = "Draft"; })).changes.length, 9); // the rule + its 8 conditionals stop going live
  const approve = draftWith((c) => { const eagle = c.rules.find((r) => r.id === "HL-002")!; eagle.status = "Approved"; eagle.conditionals[0].status = "Approved"; });
  assert.deepEqual(summary(approve), { kind: "behavior", changes: ["behavior:HL-002:added", "behavior:HL-002-C01:added"] });
});

test("names, condition labels and notes → metadata", () => {
  const draft = draftWith((c) => { birdies(c).notes = "Updated"; birdies(c).conditionals[0].condition = "Three in a row"; });
  assert.deepEqual(summary(draft), { kind: "metadata", changes: ["metadata:HL-001:notes", "metadata:HL-001-C01:condition"] });
});

test("edits to Draft rows and moving rows around change nothing that's live", () => {
  const draft = draftWith((c) => {
    c.rules.find((r) => r.id === "HL-002")!.conditionals[0].headline = "Totally new";
    birdies(c).conditionals.reverse();
    for (const rule of c.rules) rule.source = { tab: rule.source.tab, row: rule.source.row + 40 };
  });
  assert.deepEqual(summary(draft), { kind: "none", changes: [] });
});

test("the most serious kind wins when changes are mixed", () => {
  const draft = draftWith((c) => { birdies(c).notes = "x"; birdies(c).conditionals[0].body = "y"; birdies(c).conditionals[1].tier = 99; });
  assert.equal(summary(draft).kind, "behavior");
});

test("first ever publish: everything live counts as added", () => {
  const { kind, changes } = classifyChanges(null, published());
  assert.equal(kind, "behavior");
  assert.equal(changes.length, 9);
  assert.ok(changes.every((c) => c.field === "added"));
});
