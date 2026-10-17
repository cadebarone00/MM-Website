import { parseSheetRows, type RawTab, type SheetRow } from "./sheetRows.ts";
import {
  HIGHLIGHT_STATUSES, LEGACY_VARIATION_SUFFIX,
  type HighlightConditional, type HighlightConfig, type HighlightIssue, type HighlightRule, type HighlightStatus,
} from "./types.ts";

/**
 * Step 2 of an import: typed rows → HighlightConfig. Pure.
 * A CONDITIONAL row belongs to the nearest PARENT above it in the same tab; a VARIATION row to the nearest CONDITIONAL
 * above it under that PARENT. IDs are taken exactly as typed — never made up from row positions; the validator checks
 * their format, parent match and uniqueness. The one exception is a legacy conditional's own message, which gets the
 * reserved ID "<conditional ID>-V00" (derived from the conditional's typed ID, so it is just as permanent).
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
  let rule: HighlightRule | null = null;
  let conditional: HighlightConditional | null = null;
  const warn = (row: SheetRow, code: string, message: string) => issues.push({ severity: "warning", code, message, id: row.cells.id || undefined, source: row.source });
  const fail = (row: SheetRow, code: string, message: string) => issues.push({ severity: "error", code, message, id: row.cells.id || undefined, source: row.source });

  // An unknown status is an error; the item is kept as Disabled so it can never go live by accident.
  const statusOf = (row: SheetRow): HighlightStatus => {
    const status = parseStatus(row.cells.status);
    if (status) return status;
    fail(row, "unknown-status", `Status must be ${HIGHLIGHT_STATUSES.join(", ")}${row.cells.status ? `, not "${row.cells.status}"` : " (it is blank)"}.`);
    return "Disabled";
  };

  for (const row of rows) {
    if (rule && rule.category !== row.category) { rule = null; conditional = null; } // a new tab starts with no parent

    if (row.kind === "parent") {
      if (row.cells.tier || row.cells.headline || row.cells.body) {
        warn(row, "parent-has-copy", "Tier, Headline and Notification text on a PARENT row are ignored; put them on its CONDITIONAL or VARIATION rows.");
      }
      rule = { id: row.cells.id, category: row.category, name: row.cells.label, status: statusOf(row), notes: row.cells.notes, conditionals: [], source: row.source };
      conditional = null;
      rules.push(rule);
      continue;
    }

    if (row.kind === "conditional") {
      if (!rule) { fail(row, "orphan-conditional", "This CONDITIONAL row has no PARENT row above it in the same tab."); continue; }
      const status = statusOf(row);
      conditional = { id: row.cells.id, condition: row.cells.label, tier: parseTier(row.cells.tier), status, notes: row.cells.notes, variations: [], source: row.source };
      // Legacy single message: copy typed on the CONDITIONAL row is its built-in variation V00, sharing its status.
      if (row.cells.headline || row.cells.body) {
        conditional.variations.push({
          id: row.cells.id ? row.cells.id + LEGACY_VARIATION_SUFFIX : "", label: "", headline: row.cells.headline, body: row.cells.body,
          status, notes: "", legacy: true, source: row.source,
        });
      }
      rule.conditionals.push(conditional);
      continue;
    }

    // VARIATION
    if (!conditional) { fail(row, "orphan-variation", "This VARIATION row has no CONDITIONAL row above it under the same PARENT."); continue; }
    if (row.cells.tier) warn(row, "variation-has-tier", "Tier on a VARIATION row is ignored; the tier belongs on its CONDITIONAL row.");
    conditional.variations.push({
      id: row.cells.id, label: row.cells.label, headline: row.cells.headline, body: row.cells.body,
      status: statusOf(row), notes: row.cells.notes, legacy: false, source: row.source,
    });
  }
  return { config: { schemaVersion: 2, rules }, issues };
}
