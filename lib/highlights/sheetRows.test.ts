import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSheetRows } from "./sheetRows.ts";
import { HEADER, validSheet } from "./sheetFixture.ts";
import { HIGHLIGHT_TABS } from "./types.ts";

const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);

test("reads only the seven category tabs (six golf + travel) and skips blank separator rows", () => {
  const { rows, issues } = parseSheetRows(validSheet());
  assert.deepEqual(issues, []);
  assert.equal(new Set(rows.map((row) => row.category)).size, 7, "six golf tabs + travel");
  assert.ok(!rows.some((row) => row.cells.id === "HL-999"), "legacy Parent Rules / Conditionals tabs are ignored");
  assert.equal(rows.filter((row) => row.category === HIGHLIGHT_TABS[0]).length, 11); // 2 parents + 9 conditionals, no blanks
});

test("keeps the sheet row number for messages only", () => {
  const row = parseSheetRows(validSheet()).rows.find((r) => r.cells.id === "HL-002")!;
  assert.deepEqual(row.source, { tab: "Individual performance", row: 12 });
  assert.equal(row.kind, "parent");
});

test("matches columns by header name, case and spacing, not by position", () => {
  const tabs = validSheet();
  const order = [7, 6, 5, 4, 3, 2, 1, 0];
  tabs[3] = { name: " individual  PERFORMANCE ", values: tabs[3].values.map((row, i) => order.map((j) => (i === 0 ? String(row[j]).toUpperCase() : row[j]))) };
  const { rows, issues } = parseSheetRows(tabs);
  assert.deepEqual(issues, []);
  const c = rows.find((r) => r.cells.id === "HL-001-C02")!;
  assert.equal(c.cells.tier, "4");
  assert.equal(c.cells.headline, "{player}'s heating up! 🔥");
});

test("handles short rows, numbers and non-breaking spaces from the Sheets API", () => {
  const tabs = validSheet();
  tabs[4] = { name: HIGHLIGHT_TABS[1], values: [HEADER, ["HL-011", "PARENT", "Rule ", 7], [], ["HL-011-C01", "conditional", "x", 3, "h", "b", "Draft"]] };
  const { rows, issues } = parseSheetRows(tabs);
  assert.deepEqual(issues, []);
  const mine = rows.filter((r) => r.category === HIGHLIGHT_TABS[1]);
  assert.equal(mine[0].cells.label, "Rule");
  assert.equal(mine[0].cells.tier, "7");
  assert.equal(mine[0].cells.status, "");
  assert.equal(mine[1].kind, "conditional");
  assert.equal(mine[1].cells.tier, "3");
});

test("reports a missing tab, a duplicate tab, a missing column and an unknown row type", () => {
  const tabs = validSheet().filter((tab) => tab.name !== HIGHLIGHT_TABS[5]);
  tabs.push({ name: HIGHLIGHT_TABS[4], values: [HEADER] });
  tabs[4] = { name: HIGHLIGHT_TABS[1], values: [HEADER.slice(0, 6)] };
  tabs[5] = { name: HIGHLIGHT_TABS[2], values: [HEADER, ["HL-023", "HEADER", "x"], ["HL-024", "", "y"]] };
  const { issues } = parseSheetRows(tabs);
  assert.deepEqual(codes(issues).sort(), ["duplicate-tab", "missing-header", "missing-tab", "unknown-row-type", "unknown-row-type"]);
  assert.match(issues.find((i) => i.code === "missing-header")!.message, /missing the column: Status.$/);
});

test("an empty tab or a tab with only a header has no rows and no issues", () => {
  const tabs = validSheet();
  tabs[3] = { name: HIGHLIGHT_TABS[0], values: [HEADER] };
  const { rows, issues } = parseSheetRows(tabs);
  assert.deepEqual(issues, []);
  assert.equal(rows.filter((r) => r.category === HIGHLIGHT_TABS[0]).length, 0);
  assert.equal(codes(parseSheetRows([{ name: HIGHLIGHT_TABS[0], values: [] }]).issues).filter((c) => c === "missing-header").length, 1);
});
