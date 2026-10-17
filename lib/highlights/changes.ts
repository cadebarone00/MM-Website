import { publishableConfig } from "./validator.ts";
import type { HighlightConditional, HighlightConfig, HighlightRule, HighlightVariation } from "./types.ts";

/**
 * What a publish would change for players, compared with the currently published config. Pure.
 * Only what goes live is compared (Approved rules → live conditionals → Approved variations), so editing a Draft row
 * is "none".
 *   behavior  — a rule or conditional (trigger) starts or stops going live, or its Tier changes: who gets notified, and when.
 *   copy      — a message variation is added, removed or reworded: what the notification says, never whether it fires.
 *   metadata  — rule name, condition / variation label, category, notes: no effect on players.
 * Sheet row numbers are never compared — moving rows around is not a change.
 */

export type ChangeKind = "copy" | "behavior" | "metadata";
export interface HighlightChange {
  kind: ChangeKind;
  /** Rule, conditional or variation ID. */
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

type Fields<T> = { field: keyof T; kind: ChangeKind }[];
const RULE_FIELDS: Fields<HighlightRule> = [
  { field: "name", kind: "metadata" }, { field: "category", kind: "metadata" }, { field: "notes", kind: "metadata" },
];
const CONDITIONAL_FIELDS: Fields<HighlightConditional> = [
  { field: "tier", kind: "behavior" }, { field: "condition", kind: "metadata" }, { field: "notes", kind: "metadata" },
];
const VARIATION_FIELDS: Fields<HighlightVariation> = [
  { field: "headline", kind: "copy" }, { field: "body", kind: "copy" }, { field: "label", kind: "metadata" }, { field: "notes", kind: "metadata" },
];
const RANK: Record<ChangeSummary["kind"], number> = { none: 0, metadata: 1, copy: 2, behavior: 3 };

/** `published` is null before the first publish: everything that goes live counts as added. */
export function classifyChanges(published: HighlightConfig | null, draft: HighlightConfig): ChangeSummary {
  const changes: HighlightChange[] = [];
  const compare = <T,>(id: string, a: T, b: T, fields: Fields<T>) => {
    for (const { field, kind } of fields) {
      const x = a[field] as unknown as string | number | null, y = b[field] as unknown as string | number | null;
      if (x !== y) changes.push({ kind, id, field: String(field), before: x, after: y });
    }
  };
  // Calls `both` for items in both lists, and records added / removed ones with `kind`.
  const pair = <T extends { id: string }>(before: T[], after: T[], kind: ChangeKind, label: (item: T) => string, both: (a: T, b: T) => void) => {
    const old = new Map(before.map((item) => [item.id, item])), now = new Map(after.map((item) => [item.id, item]));
    for (const id of new Set([...old.keys(), ...now.keys()])) {
      const a = old.get(id), b = now.get(id);
      if (!a) changes.push({ kind, id, field: "added", before: null, after: label(b!) });
      else if (!b) changes.push({ kind, id, field: "removed", before: label(a), after: null });
      else both(a, b);
    }
  };

  const oldRules = new Map((published ? publishableConfig(published).rules : []).map((rule) => [rule.id, rule]));
  const newRules = new Map(publishableConfig(draft).rules.map((rule) => [rule.id, rule]));
  for (const id of new Set([...oldRules.keys(), ...newRules.keys()])) {
    const oldRule = oldRules.get(id), newRule = newRules.get(id);
    if (!oldRule) changes.push({ kind: "behavior", id, field: "added", before: null, after: newRule!.name });
    else if (!newRule) changes.push({ kind: "behavior", id, field: "removed", before: oldRule.name, after: null });
    else compare(id, oldRule, newRule, RULE_FIELDS);
    // A rule that starts or stops going live lists its triggers too, so the preview shows what will (stop) fire.
    pair(oldRule?.conditionals ?? [], newRule?.conditionals ?? [], "behavior", (c) => c.condition, (a, b) => {
      compare(a.id, a, b, CONDITIONAL_FIELDS);
      // Adding, removing or rewording one message changes what is said, never whether the trigger fires.
      pair(a.variations, b.variations, "copy", (v) => v.headline, (x, y) => compare(x.id, x, y, VARIATION_FIELDS));
    });
  }

  const kind = changes.reduce<ChangeSummary["kind"]>((worst, change) => (RANK[change.kind] > RANK[worst] ? change.kind : worst), "none");
  return { kind, changes };
}
