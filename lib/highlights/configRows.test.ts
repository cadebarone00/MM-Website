import { test } from "node:test";
import assert from "node:assert/strict";
import { activeConfigFromJson, draftRowPayload } from "./configRows.ts";
import { buildHighlightDraft } from "./draft.ts";
import { toXlsx, variationSheet } from "./sheetFixture.ts";

test("draftRowPayload carries exactly what save_highlight_draft needs — never the file's bytes", () => {
  const result = buildHighlightDraft({ bytes: toXlsx(variationSheet()), fileName: "rules.xlsx", published: { version: 4, config: { schemaVersion: 3, rules: [] } } });
  assert.ok(result.ok);
  const p = draftRowPayload(result.draft);
  assert.deepEqual(Object.keys(p).sort(), ["baseVersion", "changes", "config", "configFingerprint", "fileBytes", "fileFingerprint", "fileName", "report"]);
  assert.equal(p.baseVersion, 4);
  assert.equal(p.config.schemaVersion, 3);
  assert.equal(p.fileBytes, result.draft.file.bytes);
});

test("activeConfigFromJson accepts the live version (schema 2 read as 3) and rejects anything unexpected", () => {
  const config = { schemaVersion: 3, rules: [] };
  assert.deepEqual(activeConfigFromJson({ version: 3, config, configFingerprint: "sha256:x" }), { version: 3, config, configFingerprint: "sha256:x" });
  // A version published under schema 2 stays readable: same IDs (incl. its "-V00"), metadata filled in as blank.
  const v2Rule = { id: "HL-001", category: "Individual performance", name: "Birdie streak", status: "Approved", notes: "", conditionals: [
    { id: "HL-001-C01", condition: "3", tier: 3, status: "Approved", notes: "", variations: [{ id: "HL-001-C01-V00", label: "", headline: "Hot! 🔥", body: "3 birdies.", status: "Approved", notes: "", legacy: true }] }] };
  const read = activeConfigFromJson({ version: 1, config: { schemaVersion: 2, rules: [v2Rule] }, configFingerprint: "sha256:y" });
  assert.equal(read?.config.schemaVersion, 3);
  assert.deepEqual(read?.config.rules[0].meta, { notificationCategory: "", competitionEligibility: "", minimumAlertLevel: "", audience: "", reminderTrigger: "", sourceRequirement: "" });
  assert.equal(read?.config.rules[0].conditionals[0].variations[0].id, "HL-001-C01-V00");
  assert.equal(activeConfigFromJson({ version: 1, config: { schemaVersion: 1, rules: [] }, configFingerprint: "f" }), null, "unknown schema");
  for (const bad of [null, undefined, "x", {}, { version: 1.5, config, configFingerprint: "f" }, { version: 1, config: { schemaVersion: 1, rules: [] }, configFingerprint: "f" },
    { version: 1, config: { schemaVersion: 2 }, configFingerprint: "f" }, { version: 1, config, configFingerprint: 7 }]) {
    assert.equal(activeConfigFromJson(bad), null, JSON.stringify(bad));
  }
});
