import { test } from "node:test";
import assert from "node:assert/strict";
import { configFingerprint } from "./canonical.ts";
import { classifyChanges } from "./changes.ts";
import { buildHighlightDraft } from "./draft.ts";
import { importHighlightSheet } from "./importer.ts";
import { HEADER, toXlsx, variationSheet } from "./sheetFixture.ts";
import type { RawTab } from "./sheetRows.ts";
import { HIGHLIGHT_TABS, type HighlightConfig, type HighlightIssue } from "./types.ts";
import { publishableConfig, validateHighlightConfig } from "./validator.ts";

/** Message variations: Parent Rule → Conditional Trigger → Message Variations (owner request 2026-10-17). */

const load = (tabs: RawTab[]) => { const { config, issues } = importHighlightSheet(tabs); return { config, report: validateHighlightConfig(config, issues) }; };
const list = (issues: HighlightIssue[]) => issues.map((i) => `${i.code}:${i.id ?? "-"}`);
const birdieRows = (tabs: RawTab[]) => tabs[3].values;
const conditional = (config: HighlightConfig, id: string) => config.rules.flatMap((r) => r.conditionals).find((c) => c.id === id)!;

test("VARIATION rows attach to the CONDITIONAL above them, keeping typed IDs, labels, emoji and statuses", () => {
  const { config, report } = load(variationSheet());
  assert.deepEqual(report, { ok: true, errors: [], warnings: [] });
  const c1 = conditional(config, "HL-001-C01");
  assert.deepEqual(c1.variations.map((v) => [v.id, v.label, v.legacy, v.status]), [
    ["HL-001-C01-V01", "Heating up", false, "Approved"], ["HL-001-C01-V02", "Check the clubs", false, "Approved"], ["HL-001-C01-V03", "", false, "Approved"],
  ]);
  assert.equal(c1.variations[2].headline, "Three's a party! 🐦");
  assert.deepEqual(c1.variations[0].source, { tab: HIGHLIGHT_TABS[0], row: 4 });
  assert.deepEqual(conditional(config, "HL-001-C03").variations.map((v) => v.status), ["Approved", "Draft", "Disabled"]);
});

test("the CONDITIONAL row's own copy is its first variation <ID>-V01, sharing its status", () => {
  const { config } = load(variationSheet());
  assert.deepEqual(conditional(config, "HL-001-C02").variations, [{
    id: "HL-001-C02-V01", label: "", headline: "Somebody stop {player}! 🔥", body: "4 straight birdies.", status: "Approved", notes: "", legacy: true,
    source: { tab: HIGHLIGHT_TABS[0], row: 7 },
  }]);
});

test("row type is matched in any case; a VARIATION with no CONDITIONAL above it is rejected", () => {
  const tabs = variationSheet();
  birdieRows(tabs)[3][1] = "variation";
  birdieRows(tabs).splice(2, 0, ["HL-001-C09-V01", "VARIATION", "", "", "Too early", "x", "Draft", ""]); // straight after the PARENT
  tabs[4].values.splice(1, 0, ["HL-011-C01-V01", "VARIATION", "", "", "Top of tab", "x", "Draft", ""]); // first row of a tab
  const { config, report } = load(tabs);
  assert.equal(conditional(config, "HL-001-C01").variations[0].id, "HL-001-C01-V01");
  assert.deepEqual(list(report.errors), ["orphan-variation:HL-001-C09-V01", "orphan-variation:HL-011-C01-V01"]);
});

test("variation IDs: missing, malformed, reserved V00, wrong conditional and duplicates are errors even on Draft rows", () => {
  const tabs = variationSheet();
  const rows = birdieRows(tabs);
  rows[3][0] = ""; rows[4][0] = "HL-001-C01-2"; rows[9][0] = "HL-001-C03-V00"; rows[10][0] = "HL-001-C01-V03";
  rows[10][6] = "Draft"; rows[9][6] = "Draft";
  const { report } = load(tabs);
  assert.deepEqual(list(report.errors).sort(), [
    "bad-variation-id:HL-001-C01-2", "duplicate-id:HL-001-C01-V03", "missing-variation-id:-",
    "parent-mismatch:HL-001-C01-V03", "reserved-variation-id:HL-001-C03-V00",
  ]);
});

test("own copy + VARIATION rows is the sheet's layout (V1 on the CONDITIONAL, V02+ below); a VARIATION typed V01 under it is a duplicate", () => {
  // The 2026-10-19 sheet: the CONDITIONAL row holds V1, VARIATION rows hold V02 and V03.
  const sheet = variationSheet();
  const rows = birdieRows(sheet);
  rows[2][4] = "{player}'s heating up! 🔥"; rows[2][5] = "{count} birdies in a row.";
  rows.splice(3, 1); // the VARIATION typed V01 goes; V02 and V03 stay
  const { config, report } = load(sheet);
  assert.deepEqual(report, { ok: true, errors: [], warnings: [] });
  assert.deepEqual(conditional(config, "HL-001-C01").variations.map((v) => [v.id, v.legacy]), [["HL-001-C01-V01", true], ["HL-001-C01-V02", false], ["HL-001-C01-V03", false]]);
  // Keeping the V01 VARIATION row too would give two V01s — an error even in Draft (it's structural).
  const clash = variationSheet();
  birdieRows(clash)[2][4] = "Old single headline 🔥"; birdieRows(clash)[2][5] = "Old single body"; birdieRows(clash)[2][6] = "Draft";
  const errors = load(clash).report.errors;
  assert.deepEqual(list(errors), ["duplicate-id:HL-001-C01-V01"]);
  assert.match(errors[0].message, /already the CONDITIONAL row's own wording. Number this VARIATION row from V02/);
});

test("an Approved trigger needs a message: none at all is an error; none Approved is a warning (it won't fire)", () => {
  const empty = variationSheet();
  birdieRows(empty).splice(3, 3); // drop C01's variations
  assert.deepEqual(list(load(empty).report.errors), ["no-messages:HL-001-C01"]);
  const drafts = variationSheet();
  for (const row of birdieRows(drafts).slice(3, 6)) row[6] = "Draft";
  const report = load(drafts).report;
  assert.deepEqual(report.errors, []);
  assert.deepEqual(list(report.warnings), ["no-approved-variation:HL-001-C01"]);
});

test("copy checks run per variation: errors on live ones, warnings on Draft ones, nothing on Disabled ones", () => {
  const tabs = variationSheet();
  const rows = birdieRows(tabs);
  rows[3][5] = "{player} beats {opponent}"; // live: the birdie detector can't fill {opponent}
  rows[9][4] = "{name} keeps going 🔥"; // Draft
  // rows[10] is Disabled with a broken "{line" headline and empty body — ignored.
  const { report } = load(tabs);
  assert.deepEqual(list(report.errors), ["variable-not-provided:HL-001-C01-V01"]);
  assert.deepEqual(list(report.warnings), ["unknown-variable:HL-001-C03-V02"]);
});

test("warns about identical wording and an Approved variation under a Draft conditional", () => {
  const tabs = variationSheet();
  const rows = birdieRows(tabs);
  rows[4][4] = rows[3][4]; rows[4][5] = rows[3][5];
  rows[7][6] = "Draft"; // the C03 conditional back to Draft while its V01 stays Approved
  const { report } = load(tabs);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(list(report.warnings), ["duplicate-variation:HL-001-C01-V02", "parent-not-approved:HL-001-C03-V01"]);
});

test("tier belongs on the CONDITIONAL: a Tier on a VARIATION row is ignored with a warning", () => {
  const tabs = variationSheet();
  birdieRows(tabs)[3][3] = "7";
  const { config, report } = load(tabs);
  assert.equal(conditional(config, "HL-001-C01").tier, 3);
  assert.deepEqual(list(report.warnings), ["variation-has-tier:HL-001-C01-V01"]);
});

test("only Approved variations under Approved conditionals and rules are eligible", () => {
  const live = publishableConfig(load(variationSheet()).config);
  assert.deepEqual(live.rules.map((r) => r.id), ["HL-001"]);
  assert.deepEqual(live.rules[0].conditionals.map((c) => [c.id, c.variations.map((v) => v.id)]), [
    ["HL-001-C01", ["HL-001-C01-V01", "HL-001-C01-V02", "HL-001-C01-V03"]],
    ["HL-001-C02", ["HL-001-C02-V01"]],
    ["HL-001-C03", ["HL-001-C03-V01"]],
  ]);
});

test("adding, removing or rewording a variation is a copy change, never behavior", () => {
  const published = load(variationSheet()).config;
  const summary = (edit: (rows: RawTab["values"]) => void) => {
    const tabs = variationSheet(); edit(birdieRows(tabs));
    const { kind, changes } = classifyChanges(published, load(tabs).config);
    return { kind, changes: changes.map((c) => `${c.kind}:${c.id}:${c.field}`) };
  };
  assert.deepEqual(summary((rows) => rows.splice(6, 0, ["HL-001-C01-V04", "VARIATION", "", "", "Birdie party 🎉", "{count} in a row!", "Approved", ""])),
    { kind: "copy", changes: ["copy:HL-001-C01-V04:added"] });
  assert.deepEqual(summary((rows) => { rows[4][6] = "Disabled"; }), { kind: "copy", changes: ["copy:HL-001-C01-V02:removed"] });
  assert.deepEqual(summary((rows) => { rows[9][6] = "Approved"; }), { kind: "copy", changes: ["copy:HL-001-C03-V02:added"] });
  assert.deepEqual(summary((rows) => { rows[5][4] = "Three's company! 🐦"; }), { kind: "copy", changes: ["copy:HL-001-C01-V03:headline"] });
  assert.deepEqual(summary((rows) => { rows[3][2] = "Hot"; rows[3][7] = "note"; }), { kind: "metadata", changes: ["metadata:HL-001-C01-V01:label", "metadata:HL-001-C01-V01:notes"] });
  // Turning off a trigger's last live message stops the trigger: that IS behavior.
  assert.deepEqual(summary((rows) => { rows[8][6] = "Draft"; }), { kind: "behavior", changes: ["behavior:HL-001-C03:removed"] });
});

test("moving the CONDITIONAL row's own wording into a VARIATION row typed V01 keeps its ID: nothing changes for players", () => {
  const published = load(variationSheet()).config;
  const tabs = variationSheet();
  const rows = birdieRows(tabs);
  const [headline, body] = [rows[6][4], rows[6][5]];
  rows[6][4] = ""; rows[6][5] = "";
  rows.splice(7, 0, ["HL-001-C02-V01", "VARIATION", "", "", headline, body, "Approved", ""]);
  const { kind, changes } = classifyChanges(published, load(tabs).config);
  assert.deepEqual([kind, changes], ["none", []]);
});

test("fingerprint: variation row order doesn't matter; any variation wording or status does", () => {
  const base = configFingerprint(load(variationSheet()).config);
  const shuffled = variationSheet();
  const rows = birdieRows(shuffled);
  [rows[3], rows[5]] = [rows[5], rows[3]];
  assert.equal(configFingerprint(load(shuffled).config), base);
  for (const edit of [(r: RawTab["values"]) => { r[4][4] = "Somebody check those clubs! 👀👀"; }, (r: RawTab["values"]) => { r[9][6] = "Approved"; }]) {
    const tabs = variationSheet(); edit(birdieRows(tabs));
    assert.notEqual(configFingerprint(load(tabs).config), base);
  }
});

test("an .xlsx with VARIATION rows previews one line per live message, emoji intact", () => {
  const result = buildHighlightDraft({ bytes: toXlsx(variationSheet()), fileName: "rules.xlsx", published: null });
  assert.ok(result.ok);
  const { draft } = result;
  assert.equal(draft.report.ok, true);
  assert.deepEqual(draft.counts, { rules: 8, conditionals: 10, variations: 16, liveRules: 1, liveConditionals: 3, liveVariations: 5 });
  assert.deepEqual(draft.preview.map((p) => [p.variationId, p.headline, p.body]), [
    ["HL-001-C01-V01", "Alex's heating up! 🔥", "4 birdies in a row."],
    ["HL-001-C01-V02", "Somebody check those clubs! 👀", "Alex has 4 straight birdies."],
    ["HL-001-C01-V03", "Three's a party! 🐦", "Alex birdies 4 in a row."],
    ["HL-001-C02-V01", "Somebody stop Alex! 🔥", "4 straight birdies."],
    ["HL-001-C03-V01", "Alex is actually on fire! 🔥", "5 birdies in a row"],
  ]);
});

test("the sheet keeps its eight columns: VARIATION rows need no new column", () => {
  assert.deepEqual(variationSheet()[3].values[0], HEADER);
});
