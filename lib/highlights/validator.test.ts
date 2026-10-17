import { test } from "node:test";
import assert from "node:assert/strict";
import { importHighlightSheet } from "./importer.ts";
import { sheetAsFoundOn20261016, validSheet } from "./sheetFixture.ts";
import { publishableConfig, validateHighlightConfig } from "./validator.ts";
import type { HighlightConfig, HighlightIssue } from "./types.ts";

function load(edit?: (config: HighlightConfig) => void) {
  const { config, issues } = importHighlightSheet(validSheet());
  edit?.(config);
  return { config, report: validateHighlightConfig(config, issues) };
}
const list = (issues: HighlightIssue[]) => issues.map((i) => `${i.code}:${i.id ?? "-"}`);
const rule = (config: HighlightConfig, id: string) => config.rules.find((r) => r.id === id)!;

test("the clean fixture validates with no errors or warnings", () => {
  const { report } = load();
  assert.deepEqual(report, { ok: true, errors: [], warnings: [] });
});

test("the sheet as found on 2026-10-16 cannot be published", () => {
  const { config, issues } = importHighlightSheet(sheetAsFoundOn20261016());
  const report = validateHighlightConfig(config, issues);
  assert.equal(report.ok, false);
  assert.deepEqual(list(report.errors).sort(), ["missing-conditional-id:-", "missing-conditional-id:-", "missing-conditional-id:-", "unknown-status:-"]);
  assert.ok(list(report.warnings).includes("multiple-messages:-"));
});

test("IDs: missing, malformed, wrong parent and duplicates are always errors, even on Draft rows", () => {
  const { report } = load((config) => {
    const eagle = rule(config, "HL-002");
    eagle.conditionals.push({ ...eagle.conditionals[0], id: "" }, { ...eagle.conditionals[0], id: "HL-2-C1" }, { ...eagle.conditionals[0], id: "HL-001-C09" });
    rule(config, "HL-011").conditionals[0].id = "HL-099-C01";
    rule(config, "HL-023").id = "HL-031";
    rule(config, "HL-040").id = "hl-040";
  });
  // Renaming a rule also orphans its conditionals' IDs (HL-023-C01, HL-040-C01) — both are reported.
  assert.deepEqual(list(report.errors).sort(), [
    "bad-conditional-id:HL-2-C1", "bad-rule-id:hl-040", "duplicate-id:HL-031", "duplicate-id:HL-031", "missing-conditional-id:-",
    "parent-mismatch:HL-001-C09", "parent-mismatch:HL-023-C01", "parent-mismatch:HL-040-C01", "parent-mismatch:HL-099-C01",
  ]);
});

test("same conditional ID in two places is a duplicate", () => {
  const { report } = load((config) => { rule(config, "HL-001").conditionals[1].id = "HL-001-C01"; });
  assert.deepEqual(list(report.errors), ["duplicate-id:HL-001-C01", "duplicate-id:HL-001-C01"]);
});

test("birdie streak tiers must be whole numbers 3–10: error when live, warning while Draft", () => {
  const live = load((config) => {
    const [c1, c2, c3] = rule(config, "HL-001").conditionals;
    c1.tier = 2; c2.tier = 11; c3.tier = "Team of 2";
  });
  assert.deepEqual(list(live.report.errors), ["unsupported-tier:HL-001-C01", "unsupported-tier:HL-001-C02", "unsupported-tier:HL-001-C03"]);
  const draft = load((config) => { const c = rule(config, "HL-001").conditionals[0]; c.tier = 2; c.status = "Draft"; });
  assert.deepEqual(list(draft.report.errors), []);
  assert.deepEqual(list(draft.report.warnings), ["unsupported-tier:HL-001-C01"]);
  const blankTier = load((config) => { rule(config, "HL-001").conditionals[0].tier = null; });
  assert.deepEqual(list(blankTier.report.errors), ["unsupported-tier:HL-001-C01"]);
});

test("copy: empty text, unknown variables, stray braces and variables the detector can't fill", () => {
  const { report } = load((config) => {
    const [c1, c2, c3, c4] = rule(config, "HL-001").conditionals;
    c1.headline = "";
    c2.body = "{name} is hot";
    c3.body = "{player birdies";
    c4.body = "{player} beats {opponent}";
  });
  assert.deepEqual(list(report.errors), ["missing-copy:HL-001-C01", "unknown-variable:HL-001-C02", "bad-template:HL-001-C03", "variable-not-provided:HL-001-C04"]);
});

test("Draft rows only warn about copy; Disabled rows are skipped", () => {
  const { report } = load((config) => {
    rule(config, "HL-002").conditionals[0].body = "{name}";
    const off = rule(config, "HL-011");
    off.status = "Disabled";
    off.conditionals[0].headline = "";
  });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(list(report.warnings), ["unknown-variable:HL-002-C01"]);
});

test("warns about an Approved conditional under a non-Approved rule, a rule with no detector, and an empty rule", () => {
  const { report } = load((config) => {
    rule(config, "HL-002").conditionals[0].status = "Approved";
    rule(config, "HL-031").status = "Approved";
    rule(config, "HL-040").conditionals = [];
  });
  assert.equal(report.ok, true);
  assert.deepEqual(list(report.warnings), ["parent-not-approved:HL-002-C01", "no-detector:HL-031", "no-conditionals:HL-040"]);
});

test("two live rows with the same tier are an error; Disabled ones don't count", () => {
  const clash = load((config) => { rule(config, "HL-001").conditionals[1].tier = 3; });
  assert.ok(list(clash.report.errors).includes("duplicate-tier:HL-001-C02"));
  const off = load((config) => { const c = rule(config, "HL-001").conditionals[1]; c.tier = 3; c.status = "Disabled"; });
  assert.deepEqual(off.report.errors, []);
});

test("publishableConfig keeps only Approved rules with Approved conditionals", () => {
  const { config } = load((config) => {
    rule(config, "HL-001").conditionals[7].status = "Disabled";
    rule(config, "HL-002").conditionals[0].status = "Approved"; // parent still Draft
  });
  const live = publishableConfig(config);
  assert.deepEqual(live.rules.map((r) => r.id), ["HL-001"]);
  assert.deepEqual(live.rules[0].conditionals.map((c) => c.tier), [3, 4, 5, 6, 7, 8, 9]);
  assert.equal(config.rules[0].conditionals.length, 8, "the original config is not changed");
});

test("{players} is accepted on a live rule", () => {
  const { report } = load((config) => {
    const hl = rule(config, "HL-046");
    hl.status = "Approved";
    hl.conditionals[0].status = "Approved";
    hl.conditionals[0].body = "{players} birdie hole {hole}.";
  });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(list(report.warnings), ["no-detector:HL-046"]);
});

test("warns (never errors) when long names could push copy past the 80 / 180 phone limits", () => {
  const { report } = load((config) => {
    const [c1, c2, c3] = rule(config, "HL-001").conditionals;
    c1.headline = "{player}, give everyone else a chance! Seriously now 🔥"; // fine with "Alex", too long with a two-golfer side
    c2.body = "x".repeat(181);
    c3.headline = "y".repeat(80); // exactly the limit is fine
  });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(list(report.warnings), ["may-be-too-long:HL-001-C01", "may-be-too-long:HL-001-C02"]);
  assert.match(report.warnings[0].message, /Headline can reach \d+ characters/);
});
