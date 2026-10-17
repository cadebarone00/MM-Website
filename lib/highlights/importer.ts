import { parseSheetRows, type RawTab, type SheetRow } from "./sheetRows.ts";
import { HIGHLIGHT_STATUSES, type HighlightConfig, type HighlightIssue, type HighlightRule, type HighlightStatus } from "./types.ts";

/**
 * Step 2 of an import: typed rows → HighlightConfig. Pure.
 * A CONDITIONAL row belongs to the nearest PARENT above it in the same tab. IDs are taken exactly as typed — never
 * made up from row positions; validateHighlightConfig checks their format, parent match and uniqueness.
 */

export interface ImportResult { config: HighlightConfig; issues: HighlightIssue[] }

export function importHighlightSheet(tabs: RawTab[]): ImportResult {
  const parsed = parseSheetRows(tabs);
  const { config, issues } = buildConfig(parsed.rows);
  return { config, issues: [...parsed.issues, ...issues] };
}

/** "Approved" (any case) → "Approved". Anything else → null. */
export function parseStatus(text: string): HighlightStatus | null {
  return HIGHLIGHT_STATUSES.find((status) => status.toLowerCase() === text.trim().toLowerCase()) ?? null;
}

/** "4" → 4, "Team of 2" → "Team of 2", "" → null. */
export function parseTier(text: string): number | string | null {
  if (text === "") return null;
  return /^\d+$/.test(text) ? Number(text) : text;
}

export function buildConfig(rows: SheetRow[]): ImportResult {
  const issues: HighlightIssue[] = [];
  const rules: HighlightRule[] = [];
  let current: HighlightRule | null = null;

  // An unknown status is an error; the item is kept as Disabled so it can never go live by accident.
  const statusOf = (row: SheetRow): HighlightStatus => {
    const status = parseStatus(row.cells.status);
    if (status) return status;
    issues.push({ severity: "error", code: "unknown-status", id: row.cells.id || undefined, source: row.source,
      message: `Status must be ${HIGHLIGHT_STATUSES.join(", ")}${row.cells.status ? `, not "${row.cells.status}"` : " (it is blank)"}.` });
    return "Disabled";
  };

  for (const row of rows) {
    if (current && current.category !== row.category) current = null; // a new tab starts with no parent
    if (row.kind === "parent") {
      if (row.cells.tier || row.cells.headline || row.cells.body) {
        issues.push({ severity: "warning", code: "parent-has-copy", id: row.cells.id || undefined, source: row.source,
          message: "Tier, Headline and Notification text on a PARENT row are ignored; put them on its CONDITIONAL rows." });
      }
      current = { id: row.cells.id, category: row.category, name: row.cells.label, status: statusOf(row), notes: row.cells.notes, conditionals: [], source: row.source };
      rules.push(current);
      continue;
    }
    if (!current) {
      issues.push({ severity: "error", code: "orphan-conditional", id: row.cells.id || undefined, source: row.source,
        message: "This CONDITIONAL row has no PARENT row above it in the same tab." });
      continue;
    }
    current.conditionals.push({
      id: row.cells.id, condition: row.cells.label, tier: parseTier(row.cells.tier), headline: row.cells.headline,
      body: row.cells.body, status: statusOf(row), notes: row.cells.notes, source: row.source,
    });
  }
  return { config: { schemaVersion: 1, rules }, issues };
}
