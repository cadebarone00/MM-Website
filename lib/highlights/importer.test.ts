import { test } from "node:test";
import assert from "node:assert/strict";
import { importHighlightSheet, parseStatus, parseTier } from "./importer.ts";
import { HEADER, validSheet } from "./sheetFixture.ts";
import { HIGHLIGHT_TABS } from "./types.ts";

test("groups CONDITIONAL rows under the PARENT above them", () => {
  const { config, issues } = importHighlightSheet(validSheet());
  assert.deepEqual(issues, []);
  assert.equal(config.schemaVersion, 1);
  assert.deepEqual(config.rules.map((r) => r.id), ["HL-001", "HL-002", "HL-011", "HL-023", "HL-031", "HL-040", "HL-046"]);
  const birdies = config.rules[0];
  assert.equal(birdies.category, "Individual performance");
  assert.equal(birdies.status, "Approved");
  assert.deepEqual(birdies.conditionals.map((c) => c.tier), [3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(birdies.conditionals[0].id, "HL-001-C01");
  assert.equal(birdies.conditionals[0].body, "{count} birdies in a row.");
  assert.equal(config.rules[1].conditionals[0].tier, null);
});

test("parses statuses in any case and tiers as numbers or labels", () => {
  assert.equal(parseStatus("approved"), "Approved");
  assert.equal(parseStatus(" DISABLED "), "Disabled");
  assert.equal(parseStatus("Needs copy"), null);
  assert.equal(parseStatus(""), null);
  assert.equal(parseTier("10"), 10);
  assert.equal(parseTier("Team of 2"), "Team of 2");
  assert.equal(parseTier("3.5"), "3.5");
  assert.equal(parseTier(""), null);
});

test("an unknown status is an error and the item is kept Disabled so it can't go live", () => {
  const tabs = validSheet();
  tabs[3].values[2][6] = "Needs copy";
  const { config, issues } = importHighlightSheet(tabs);
  assert.deepEqual(issues.map((i) => [i.code, i.id, i.source?.row]), [["unknown-status", "HL-001-C01", 3]]);
  assert.equal(config.rules[0].conditionals[0].status, "Disabled");
});

test("never makes up IDs: a blank conditional ID stays blank for the validator to reject", () => {
  const tabs = validSheet();
  tabs[3].values[2][0] = "";
  const { config } = importHighlightSheet(tabs);
  assert.equal(config.rules[0].conditionals[0].id, "");
});

test("a CONDITIONAL with no PARENT above it in its own tab is rejected, not attached to the previous tab's rule", () => {
  const tabs = validSheet();
  tabs[4] = { name: HIGHLIGHT_TABS[1], values: [HEADER, ["HL-012-C01", "CONDITIONAL", "x", "", "h", "b", "Draft", ""], ["HL-012", "PARENT", "Streak", "", "", "", "Draft", ""]] };
  const { config, issues } = importHighlightSheet(tabs);
  assert.deepEqual(issues.map((i) => i.code), ["orphan-conditional"]);
  assert.equal(config.rules.find((r) => r.id === "HL-012")!.conditionals.length, 0);
  assert.equal(config.rules.find((r) => r.id === "HL-002")!.conditionals.length, 1);
});

test("copy typed on a PARENT row is flagged as ignored", () => {
  const tabs = validSheet();
  tabs[3].values[1][4] = "Stray headline";
  assert.deepEqual(importHighlightSheet(tabs).issues.map((i) => [i.severity, i.code]), [["warning", "parent-has-copy"]]);
});

test("parser issues come through the importer", () => {
  const { issues } = importHighlightSheet([]);
  assert.equal(issues.filter((i) => i.code === "missing-tab").length, 6);
});
