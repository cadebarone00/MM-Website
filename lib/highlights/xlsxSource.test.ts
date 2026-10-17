import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { importHighlightSheet } from "./importer.ts";
import { HEADER, toXlsx, validSheet } from "./sheetFixture.ts";
import { HIGHLIGHT_TABS } from "./types.ts";
import { MAX_ROWS_PER_TAB, MAX_XLSX_BYTES, readHighlightWorkbook } from "./xlsxSource.ts";

const read = (bytes: Uint8Array, name = "highlights.xlsx") => readHighlightWorkbook(bytes, name);
const rejection = (bytes: Uint8Array, name?: string) => { const r = readHighlightWorkbook(bytes, name); return r.ok ? "accepted" : r.code; };

test("a Google-style .xlsx export imports exactly like the same cells given directly", () => {
  const result = read(toXlsx(validSheet()));
  assert.ok(result.ok);
  assert.deepEqual(result.tabs.map((t) => t.name), [...HIGHLIGHT_TABS], "legacy tabs are not even parsed");
  assert.deepEqual(importHighlightSheet(result.tabs), importHighlightSheet(validSheet()));
});

test("emoji, curly quotes, accents and other scripts survive byte for byte", () => {
  const text = ["{player}’s heating up! 🔥", "Family 👨‍👩‍👧 · flag 🇺🇸 · café · é · ゴルフ · 🏌🏽‍♀️"];
  const tabs = validSheet();
  tabs[3].values[2][4] = text[0];
  tabs[3].values[2][5] = text[1];
  const result = read(toXlsx(tabs));
  assert.ok(result.ok);
  const c = importHighlightSheet(result.tabs).config.rules[0].conditionals[0];
  assert.equal(c.variations[0].headline, text[0]);
  assert.equal(c.variations[0].body, text[1]);
});

test("blank separator rows are kept so error rows match the sheet, even above the used range", () => {
  const tabs = validSheet();
  tabs[3] = { name: HIGHLIGHT_TABS[0], values: [HEADER, [], [], [], ["HL-001", "PARENT", "Birdie streak", "", "", "", "Needs copy", ""]] };
  const result = read(toXlsx(tabs));
  assert.ok(result.ok);
  const issue = importHighlightSheet(result.tabs).issues.find((i) => i.code === "unknown-status")!;
  assert.deepEqual(issue.source, { tab: HIGHLIGHT_TABS[0], row: 5 });

  // A tab whose first cells start at C3: still read from A1, so the header problem is reported on row 1.
  const shifted = validSheet();
  shifted[4] = { name: HIGHLIGHT_TABS[1], values: [] };
  const bytes = toXlsx(shifted, (sheet, name) => { if (name === HIGHLIGHT_TABS[1]) XLSX.utils.sheet_add_aoa(sheet, [HEADER], { origin: "C3" }); });
  const read2 = read(bytes);
  assert.ok(read2.ok);
  const values = read2.tabs.find((t) => t.name === HIGHLIGHT_TABS[1])!.values;
  assert.equal(values[2][2], "Rule ID");
  assert.equal(importHighlightSheet(read2.tabs).issues.find((i) => i.code === "missing-header")!.source!.row, 1);
});

test("numbers and formula cells are read as their displayed text; formulas are never evaluated", () => {
  const tabs = validSheet();
  tabs[3].values[2][3] = 3 as unknown as string; // a real number cell
  const bytes = toXlsx(tabs, (sheet, name) => {
    if (name === HIGHLIGHT_TABS[0]) sheet["E3"] = { t: "s", v: "Cached text 🔥", f: 'CONCAT("Cached ","text")' };
  });
  const result = read(bytes);
  assert.ok(result.ok);
  const c = importHighlightSheet(result.tabs).config.rules[0].conditionals[0];
  assert.equal(c.tier, 3);
  assert.equal(c.variations[0].headline, "Cached text 🔥");
});

test("missing category tabs are left for the importer to report", () => {
  const result = read(toXlsx(validSheet().slice(0, 5)));
  assert.ok(result.ok);
  assert.equal(importHighlightSheet(result.tabs).issues.filter((i) => i.code === "missing-tab").length, 4);
});

test("rejects empty, oversized, wrong-type and broken files without throwing", () => {
  const good = toXlsx(validSheet());
  assert.equal(rejection(new Uint8Array(0)), "empty-file");
  const huge = new Uint8Array(MAX_XLSX_BYTES + 1); huge.set([0x50, 0x4b, 0x03, 0x04]);
  assert.equal(rejection(huge, "big.xlsx"), "file-too-large");
  assert.equal(rejection(good, "rules.csv"), "wrong-file-type");
  assert.equal(rejection(good, "rules.xlsm"), "wrong-file-type");
  assert.equal(rejection(good, "rules.xlsx.exe"), "wrong-file-type");
  assert.equal(rejection(good, "Rules.XLSX"), "accepted");
  assert.equal(rejection(good), "accepted");
  assert.equal(rejection(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]), "old.xlsx"), "wrong-file-type");
  assert.equal(rejection(new TextEncoder().encode("Rule ID,Row type\nHL-001,PARENT"), "fake.xlsx"), "wrong-file-type");
  const broken = new Uint8Array(200); broken.set([0x50, 0x4b, 0x03, 0x04]); broken.fill(7, 4);
  assert.equal(rejection(broken, "broken.xlsx"), "unreadable-workbook");
  assert.equal(rejection(good.slice(0, good.length / 2), "cut.xlsx"), "unreadable-workbook");
});

test("caps rows on category tabs only; huge legacy tabs are never parsed", () => {
  const tooMany = validSheet();
  tooMany[3].values = [HEADER, ...Array.from({ length: MAX_ROWS_PER_TAB }, () => ["", "", "x"])];
  assert.equal(rejection(toXlsx(tooMany), "big.xlsx"), "too-many-rows");
  const bigLegacy = validSheet();
  bigLegacy[1].values = Array.from({ length: MAX_ROWS_PER_TAB * 2 }, (_, i) => [`legacy ${i}`]);
  assert.equal(rejection(toXlsx(bigLegacy), "ok.xlsx"), "accepted");
});
