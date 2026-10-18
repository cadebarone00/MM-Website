import { test } from "node:test";
import assert from "node:assert/strict";
import { activeConfigFromJson, draftRowPayload } from "./configRows.ts";
import { buildHighlightDraft } from "./draft.ts";
import { toXlsx, variationSheet } from "./sheetFixture.ts";

test("draftRowPayload carries exactly what save_highlight_draft needs — never the file's bytes", () => {
  const result = buildHighlightDraft({ bytes: toXlsx(variationSheet()), fileName: "rules.xlsx", published: { version: 4, config: { schemaVersion: 2, rules: [] } } });
  assert.ok(result.ok);
  const p = draftRowPayload(result.draft);
  assert.deepEqual(Object.keys(p).sort(), ["baseVersion", "changes", "config", "configFingerprint", "fileBytes", "fileFingerprint", "fileName", "report"]);
  assert.equal(p.baseVersion, 4);
  assert.equal(p.config.schemaVersion, 2);
  assert.equal(p.fileBytes, result.draft.file.bytes);
});

test("activeConfigFromJson accepts the live version and rejects anything unexpected", () => {
  const config = { schemaVersion: 2, rules: [] };
  assert.deepEqual(activeConfigFromJson({ version: 3, config, configFingerprint: "sha256:x" }), { version: 3, config, configFingerprint: "sha256:x" });
  for (const bad of [null, undefined, "x", {}, { version: 1.5, config, configFingerprint: "f" }, { version: 1, config: { schemaVersion: 1, rules: [] }, configFingerprint: "f" },
    { version: 1, config: { schemaVersion: 2 }, configFingerprint: "f" }, { version: 1, config, configFingerprint: 7 }]) {
    assert.equal(activeConfigFromJson(bad), null, JSON.stringify(bad));
  }
});
