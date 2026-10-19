import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalConfig, canonicalJson, configFingerprint, fileFingerprint } from "./canonical.ts";
import { importHighlightSheet } from "./importer.ts";
import { HEADER, toXlsx, validSheet } from "./sheetFixture.ts";
import type { RawTab } from "./sheetRows.ts";
import { readHighlightWorkbook } from "./xlsxSource.ts";

const fingerprintOf = (tabs: RawTab[]) => configFingerprint(importHighlightSheet(tabs).config);
const fromXlsx = (bytes: Uint8Array) => { const r = readHighlightWorkbook(bytes, "x.xlsx"); assert.ok(r.ok); return configFingerprint(importHighlightSheet(r.tabs).config); };

test("fingerprints look like sha256:<64 hex>", () => {
  assert.match(fingerprintOf(validSheet()), /^sha256:[0-9a-f]{64}$/);
  assert.match(fileFingerprint(new Uint8Array([1, 2, 3])), /^sha256:[0-9a-f]{64}$/);
});

test("row positions, blank rows, rule order and cell padding don't change the fingerprint", () => {
  const base = fingerprintOf(validSheet());
  const moved = validSheet();
  const rows = moved[3].values.slice(1);
  // HL-002 block moved above HL-001, extra blank rows, conditionals of HL-001 reversed.
  const hl1 = rows.slice(0, 9), hl2 = rows.slice(10);
  moved[3].values = [HEADER, ...hl2, [], [], [], hl1[0], ...hl1.slice(1).reverse(), []];
  moved[4].values[1] = moved[4].values[1].map((cell) => (cell === "" ? cell : `  ${cell} `));
  assert.equal(fingerprintOf(moved), base);
});

test("column widths, row heights and other file-level formatting don't change it either", () => {
  const plain = toXlsx(validSheet());
  const styled = toXlsx(validSheet(), (sheet) => { sheet["!cols"] = [{ wch: 40 }, { wch: 12 }]; sheet["!rows"] = [{ hpt: 30 }]; });
  assert.notEqual(fileFingerprint(plain), fileFingerprint(styled));
  assert.equal(fromXlsx(plain), fromXlsx(styled));
  assert.equal(fromXlsx(plain), fingerprintOf(validSheet()));
});

test("any real content change gives a new fingerprint", () => {
  const base = fingerprintOf(validSheet());
  const edits: ((tabs: RawTab[]) => void)[] = [
    (t) => { t[3].values[2][4] = "{player}'s heating up! 🔥🔥"; }, // one more emoji
    (t) => { t[3].values[2][5] = "{count} birdies in a row!"; },
    (t) => { t[3].values[2][6] = "Draft"; },
    (t) => { t[3].values[2][3] = "11"; },
    (t) => { t[3].values[2][7] = "New note"; },
    (t) => { t[3].values[1][2] = "Birdie run"; },
  ];
  const seen = new Set([base]);
  for (const edit of edits) { const tabs = validSheet(); edit(tabs); seen.add(fingerprintOf(tabs)); }
  assert.equal(seen.size, edits.length + 1);
});

test("canonical config: sorted by ID, no sheet row numbers, wording untouched, input unchanged", () => {
  const imported = importHighlightSheet(validSheet()).config;
  imported.rules.reverse();
  const canonical = canonicalConfig(imported);
  assert.deepEqual(canonical.rules.map((r) => r.id), ["HL-001", "HL-002", "HL-011", "HL-023", "HL-031", "HL-040", "HL-046", "TR-001"]);
  assert.ok(!canonicalJson(imported).includes('"source"'));
  assert.ok(canonicalJson(imported).includes("🔥"));
  assert.ok(imported.rules[0].source, "the imported config keeps its rows for error messages");
  assert.deepEqual(canonicalConfig(canonical), canonical, "canonicalizing twice changes nothing");
  assert.equal(configFingerprint(canonical), configFingerprint(imported));
});
