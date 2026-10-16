import { publishableConfig } from "./validator.ts";
import type { HighlightConditional, HighlightConfig, HighlightRule } from "./types.ts";

/**
 * What a publish would change for players, compared with the currently published config. Pure.
 * Only what goes live is compared (Approved rules + Approved conditionals), so editing a Draft row is "none".
 *   copy      — Headline / Notification text: wording only.
 *   behavior  — a rule or conditional starts or stops going live, or its Tier changes: who gets notified, and when.
 *   metadata  — rule name, condition label, category, notes: no effect on players.
 * Sheet row numbers are never compared — moving rows around is not a change.
 */

export type ChangeKind = "copy" | "behavior" | "metadata";
export interface HighlightChange {
  kind: ChangeKind;
  /** Rule or conditional ID. */
  id: string;
  /** "added" / "removed", or the field that changed. */
  field: string;
  before: string | number | null;
  after: string | number | null;
}
export interface ChangeSummary {
  /** The most serious kind present: behavior > copy > metadata > none. */
  kind: ChangeKind | "none";
  changes: HighlightChange[];
}

const RULE_FIELDS: { field: keyof HighlightRule; kind: ChangeKind }[] = [
  { field: "name", kind: "metadata" }, { field: "category", kind: "metadata" }, { field: "notes", kind: "metadata" },
];
const CONDITIONAL_FIELDS: { field: keyof HighlightConditional; kind: ChangeKind }[] = [
  { field: "tier", kind: "behavior" }, { field: "headline", kind: "copy" }, { field: "body", kind: "copy" },
  { field: "condition", kind: "metadata" }, { field: "notes", kind: "metadata" },
];
const RANK: Record<ChangeSummary["kind"], number> = { none: 0, metadata: 1, copy: 2, behavior: 3 };

/** `published` is null before the first publish: everything that goes live counts as added. */
export function classifyChanges(published: HighlightConfig | null, draft: HighlightConfig): ChangeSummary {
  const before = new Map((published ? publishableConfig(published).rules : []).map((rule) => [rule.id, rule]));
  const after = new Map(publishableConfig(draft).rules.map((rule) => [rule.id, rule]));
  const changes: HighlightChange[] = [];
  const compare = <T,>(id: string, a: T, b: T, fields: { field: keyof T; kind: ChangeKind }[]) => {
    for (const { field, kind } of fields) {
      const x = a[field] as unknown as string | number | null, y = b[field] as unknown as string | number | null;
      if (x !== y) changes.push({ kind, id, field: String(field), before: x, after: y });
    }
  };

  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const oldRule = before.get(id), newRule = after.get(id);
    if (!oldRule) changes.push({ kind: "behavior", id, field: "added", before: null, after: newRule!.name });
    else if (!newRule) changes.push({ kind: "behavior", id, field: "removed", before: oldRule.name, after: null });
    else compare(id, oldRule, newRule, RULE_FIELDS);

    const oldConditionals = new Map((oldRule?.conditionals ?? []).map((c) => [c.id, c]));
    const newConditionals = new Map((newRule?.conditionals ?? []).map((c) => [c.id, c]));
    for (const conditionalId of new Set([...oldConditionals.keys(), ...newConditionals.keys()])) {
      const a = oldConditionals.get(conditionalId), b = newConditionals.get(conditionalId);
      if (!a) changes.push({ kind: "behavior", id: conditionalId, field: "added", before: null, after: b!.headline });
      else if (!b) changes.push({ kind: "behavior", id: conditionalId, field: "removed", before: a.headline, after: null });
      else compare(conditionalId, a, b, CONDITIONAL_FIELDS);
    }
  }

  const kind = changes.reduce<ChangeSummary["kind"]>((worst, change) => (RANK[change.kind] > RANK[worst] ? change.kind : worst), "none");
  return { kind, changes };
}
