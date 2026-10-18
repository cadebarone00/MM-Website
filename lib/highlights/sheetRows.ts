import { HIGHLIGHT_HEADERS, HIGHLIGHT_TABS, type HighlightCategory, type HighlightColumn, type HighlightIssue, type SheetLocation } from "./types.ts";

/**
 * Step 1 of an import: raw spreadsheet cells → typed rows. Pure; no Google access.
 * Input is the shape the Google Sheets API "values" endpoint returns: one array of rows per tab, each row an array of
 * cell values (trailing empty cells may be missing). Only the six category tabs are read; the first row is the header.
 */

export type RawCell = string | number | boolean | null | undefined;
export interface RawTab { name: string; values: RawCell[][] }

export type SheetRowKind = "parent" | "conditional" | "variation";
export interface SheetRow {
  kind: SheetRowKind;
  category: HighlightCategory;
  source: SheetLocation;
  cells: Record<HighlightColumn, string>;
}

export interface ParsedSheet { rows: SheetRow[]; issues: HighlightIssue[] }

const COLUMNS = Object.keys(HIGHLIGHT_HEADERS) as HighlightColumn[];
const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
const cellText = (value: RawCell) => (value === null || value === undefined ? "" : String(value)).replace(/ /g, " ").trim();

export function parseSheetRows(tabs: RawTab[]): ParsedSheet {
  const rows: SheetRow[] = [];
  const issues: HighlightIssue[] = [];
  const error = (code: string, message: string, source?: SheetLocation) => issues.push({ severity: "error", code, message, source });

  for (const category of HIGHLIGHT_TABS) {
    const matching = tabs.filter((tab) => normalize(tab.name) === normalize(category));
    if (matching.length === 0) { error("missing-tab", `The "${category}" tab is missing.`); continue; }
    if (matching.length > 1) { error("duplicate-tab", `There is more than one "${category}" tab.`); continue; }
    const [header = [], ...body] = matching[0].values;

    const position = {} as Record<HighlightColumn, number>;
    const missing: string[] = [];
    for (const column of COLUMNS) {
      const index = header.findIndex((cell) => normalize(cellText(cell)) === normalize(HIGHLIGHT_HEADERS[column]));
      if (index === -1) missing.push(HIGHLIGHT_HEADERS[column]);
      position[column] = index;
    }
    if (missing.length) {
      error("missing-header", `The "${category}" tab is missing the column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`, { tab: category, row: 1 });
      continue;
    }

    body.forEach((raw, index) => {
      const source = { tab: category, row: index + 2 };
      const cells = Object.fromEntries(COLUMNS.map((column) => [column, cellText(raw[position[column]])])) as Record<HighlightColumn, string>;
      // Blank rows are the visual separators between rules.
      if (COLUMNS.every((column) => cells[column] === "")) return;
      const type = normalize(cells.rowType);
      if (type === "parent" || type === "conditional" || type === "variation") rows.push({ kind: type, category, source, cells });
      else error("unknown-row-type", `Row type must be PARENT, CONDITIONAL or VARIATION${cells.rowType ? `, not "${cells.rowType}"` : " (it is blank)"}.`, source);
    });
  }
  return { rows, issues };
}
