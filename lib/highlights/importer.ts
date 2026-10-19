import { parseSheetRows, type RawTab, type SheetRow } from "./sheetRows.ts";
import {
  HIGHLIGHT_STATUSES, OWN_VARIATION_SUFFIX, RULE_META_KEYS,
  type HighlightConditional, type HighlightConfig, type HighlightIssue, type HighlightRule, type HighlightStatus, type RuleMeta,
} from "./types.ts";

/**
 * Step 2 of an import: typed rows → HighlightConfig (schema 3). Pure.
 * A CONDITIONAL row belongs to the nearest PARENT above it in the same tab; a VARIATION row to the nearest CONDITIONAL
 * above it under that PARENT. IDs are taken exactly as typed — never made up from row positions; the validator checks
 * their format, parent match and uniqueness. The one derived ID is the CONDITIONAL row's own wording,
 * "<conditional ID>-V01" (built from the conditional's typed ID, so it is just as permanent).
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

/** A Tier cell holding "V1", "V2"… is a version label (tabs without a Version column put it there), not a tier. */
export const isVersionLabel = (text: string) => /^v\d{1,2}$/i.test(text.trim());

/** "4" → 4, "Team of 2" → "Team of 2", "" or a version label like "V1" → null. */
export function parseTier(text: string): number | string | null {
  if (text === "" || isVersionLabel(text)) return null;
  return /^\d+$/.test(text) ? Number(text) : text;
}

const metaOf = (row: SheetRow): RuleMeta => Object.fromEntries(RULE_META_KEYS.map((key) => [key, row.cells[key]])) as RuleMeta;

export function buildConfig(rows: SheetRow[]): ImportResult {
  const issues: HighlightIssue[] = [];
  const rules: HighlightRule[] = [];
  let rule: HighlightRule | null = null;
  let conditional: HighlightConditional | null = null;
  const warn = (row: SheetRow, code: string, message: string) => issues.push({ severity: "warning", code, message, id: row.cells.id || undefined, source: row.source });
  const fail = (row: SheetRow, code: string, message: string) => issues.push({ severity: "error", code, message, id: row.cells.id || undefined, source: row.source });

  // An unknown status is an error; the item is kept as Disabled so it can never go live by accident.
  const statusOf = (row: SheetRow, inherit?: HighlightStatus): HighlightStatus => {
    if (!row.cells.status && inherit) return inherit; // a VARIATION row with a blank Status follows its conditional
    const status = parseStatus(row.cells.status);
    if (status) return status;
    fail(row, "unknown-status", `Status must be ${HIGHLIGHT_STATUSES.join(", ")}${row.cells.status ? `, not "${row.cells.status}"` : " (it is blank)"}.`);
    return "Disabled";
  };
  // Travel rows repeat the rule's metadata on every row; only the PARENT row's counts.
  const checkRepeatedMeta = (row: SheetRow) => {
    if (!rule) return;
    const differs = RULE_META_KEYS.filter((key) => row.cells[key] && row.cells[key] !== rule!.meta[key]);
    if (differs.length) warn(row, "metadata-differs", `This row's ${differs.join(", ")} differ from its PARENT row; only the PARENT row's values are used.`);
  };

  for (const row of rows) {
    if (rule && rule.category !== row.category) { rule = null; conditional = null; } // a new tab starts with no parent

    if (row.kind === "parent") {
      if ((row.cells.tier && !isVersionLabel(row.cells.tier)) || row.cells.headline || row.cells.body) {
        warn(row, "parent-has-copy", "Tier, Headline and Notification text on a PARENT row are ignored; put them on its CONDITIONAL or VARIATION rows.");
      }
      rule = { id: row.cells.id, category: row.category, name: row.cells.label, status: statusOf(row), notes: row.cells.notes, meta: metaOf(row), conditionals: [], source: row.source };
      conditional = null;
      rules.push(rule);
      continue;
    }

    if (row.kind === "conditional") {
      if (!rule) { fail(row, "orphan-conditional", "This CONDITIONAL row has no PARENT row above it in the same tab."); continue; }
      checkRepeatedMeta(row);
      const status = statusOf(row);
      conditional = { id: row.cells.id, condition: row.cells.label, tier: parseTier(row.cells.tier), status, notes: row.cells.notes, variations: [], source: row.source };
      // The CONDITIONAL row's own Headline / Notification text is its first wording, V01, sharing its status.
      if (row.cells.headline || row.cells.body) {
        conditional.variations.push({
          id: row.cells.id ? row.cells.id + OWN_VARIATION_SUFFIX : "", label: "", headline: row.cells.headline, body: row.cells.body,
          status, notes: "", legacy: true, source: row.source,
        });
      }
      rule.conditionals.push(conditional);
      continue;
    }

    // VARIATION
    if (!conditional) { fail(row, "orphan-variation", "This VARIATION row has no CONDITIONAL row above it under the same PARENT."); continue; }
    checkRepeatedMeta(row);
    if (row.cells.tier && !isVersionLabel(row.cells.tier)) warn(row, "variation-has-tier", "Tier on a VARIATION row is ignored; the tier belongs on its CONDITIONAL row.");
    conditional.variations.push({
      id: row.cells.id, label: row.cells.label === conditional.condition ? "" : row.cells.label, headline: row.cells.headline, body: row.cells.body,
      status: statusOf(row, conditional.status), notes: row.cells.notes, legacy: false, source: row.source,
    });
  }
  return { config: { schemaVersion: 3, rules }, issues };
}
