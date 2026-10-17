import { createHash } from "node:crypto";
import type { HighlightConditional, HighlightConfig, HighlightRule } from "./types.ts";

/**
 * The stored form of a config and its fingerprint. Pure.
 * Canonical = rules and conditionals sorted by ID, fields in a fixed order, no sheet row numbers. So moving rows,
 * adding blank rows or changing fonts / colors / column widths gives the same fingerprint; any change to wording,
 * emoji, status, tier, name, category or notes gives a different one. Text is kept exactly as imported (the importer
 * already trims cell edges) — never rewritten, so approved wording and emoji are stored byte for byte.
 */

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function canonicalConditional(c: HighlightConditional): HighlightConditional {
  return { id: c.id, condition: c.condition, tier: c.tier, headline: c.headline, body: c.body, status: c.status, notes: c.notes };
}

function canonicalRule(rule: HighlightRule): HighlightRule {
  return {
    id: rule.id, category: rule.category, name: rule.name, status: rule.status, notes: rule.notes,
    conditionals: rule.conditionals.map(canonicalConditional).sort(byId),
  };
}

export function canonicalConfig(config: HighlightConfig): HighlightConfig {
  return { schemaVersion: 1, rules: config.rules.map(canonicalRule).sort(byId) };
}

/** Stable JSON: same config → same string, whatever the sheet's row order. */
export function canonicalJson(config: HighlightConfig): string {
  return JSON.stringify(canonicalConfig(config));
}

/** "sha256:<hex>" of the canonical config — what a published version is identified by. */
export function configFingerprint(config: HighlightConfig): string {
  return `sha256:${createHash("sha256").update(canonicalJson(config), "utf8").digest("hex")}`;
}

/** "sha256:<hex>" of the uploaded file's bytes — kept for the audit trail instead of the file itself. */
export function fileFingerprint(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
