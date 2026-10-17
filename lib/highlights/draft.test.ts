import { test } from "node:test";
import assert from "node:assert/strict";
import * as draftModule from "./draft.ts";
import { buildHighlightDraft, type HighlightDraft } from "./draft.ts";
import { toXlsx, validSheet } from "./sheetFixture.ts";
import type { RawTab } from "./sheetRows.ts";

function draftFrom(tabs: RawTab[], published: draftModule.PublishedVersion | null = null): HighlightDraft {
  const result = buildHighlightDraft({ bytes: toXlsx(tabs), fileName: "The_Maroon_Highlights_Source_of_Truth.xlsx", published });
  assert.ok(result.ok);
  return result.draft;
}

test("first upload: everything Approved counts as new behavior and gets a sample preview", () => {
  const draft = draftFrom(validSheet());
  assert.equal(draft.baseVersion, null);
  assert.equal(draft.report.ok, true);
  assert.equal(draft.changes.kind, "behavior");
  assert.equal(draft.canPublish, true);
  assert.equal(draft.needsBehaviorConfirm, true);
  assert.deepEqual(draft.counts, { rules: 7, conditionals: 14, liveRules: 1, liveConditionals: 8 });
  assert.equal(draft.preview.length, 8);
  assert.deepEqual(draft.preview[1], { conditionalId: "HL-001-C02", ruleId: "HL-001", headline: "Alex's heating up! 🔥", body: "4 birdies in a row." });
  assert.equal(draft.file.name, "The_Maroon_Highlights_Source_of_Truth.xlsx");
  assert.match(draft.file.fingerprint, /^sha256:/);
  assert.match(draft.configFingerprint, /^sha256:/);
});

test("the draft carries the parsed rules and fingerprints, never the file or sheet row numbers", () => {
  const draft = draftFrom(validSheet());
  const json = JSON.stringify(draft);
  assert.ok(!json.includes("PK\u0003\u0004") && !json.includes('"source"'));
  assert.ok(json.length < 20000);
  assert.ok(draft.file.bytes > 0);
});

test("re-uploading what's live changes nothing and can't be published", () => {
  const first = draftFrom(validSheet());
  const again = draftFrom(validSheet(), { version: 3, config: first.config });
  assert.equal(again.baseVersion, 3);
  assert.equal(again.configFingerprint, first.configFingerprint);
  assert.deepEqual(again.changes, { kind: "none", changes: [] });
  assert.equal(again.canPublish, false);
});

test("a wording-only edit is a copy change: publishable without the behavior confirm", () => {
  const live = draftFrom(validSheet()).config;
  const tabs = validSheet();
  tabs[3].values[3][4] = "Somebody stop {player}! 🔥";
  const draft = draftFrom(tabs, { version: 1, config: live });
  assert.equal(draft.changes.kind, "copy");
  assert.equal(draft.canPublish, true);
  assert.equal(draft.needsBehaviorConfirm, false);
  assert.equal(draft.preview[1].headline, "Somebody stop Alex! 🔥");
});

test("a sheet with errors still previews but can't be published", () => {
  const tabs = validSheet();
  tabs[3].values[2][0] = "";
  const draft = draftFrom(tabs);
  assert.equal(draft.report.ok, false);
  assert.equal(draft.canPublish, false);
  assert.ok(draft.report.errors.some((e) => e.code === "missing-conditional-id" && e.source?.row === 3));
});

test("a bad file is rejected before anything is parsed", () => {
  const result = buildHighlightDraft({ bytes: new TextEncoder().encode("not a spreadsheet"), fileName: "rules.xlsx", published: null });
  assert.deepEqual(result.ok ? null : result.code, "wrong-file-type");
});

test("there is no way to publish from this module", () => {
  assert.deepEqual(Object.keys(draftModule).filter((name) => /publish/i.test(name)), []);
});
