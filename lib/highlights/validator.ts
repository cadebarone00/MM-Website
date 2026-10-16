import { detectorFor } from "./catalog.ts";
import { checkTemplate } from "./template.ts";
import {
  CONDITIONAL_ID_PATTERN, RULE_ID_PATTERN,
  type HighlightConditional, type HighlightConfig, type HighlightIssue, type HighlightRule, type IssueSeverity, type ValidationReport,
} from "./types.ts";

/**
 * Step 3 of an import: checks a config before it can be previewed or published. Pure.
 * Structural problems (IDs, duplicates) are always errors. Content problems are errors on rows that would go live
 * (rule AND conditional Approved) and warnings on Draft rows; Disabled rows skip content checks. Publish needs ok.
 */

/** A conditional goes live only when it and its parent rule are both Approved. */
export const isLive = (rule: HighlightRule, conditional: HighlightConditional) => rule.status === "Approved" && conditional.status === "Approved";

/** Only what would actually go live: Approved rules with their Approved conditionals. */
export function publishableConfig(config: HighlightConfig): HighlightConfig {
  return {
    schemaVersion: 1,
    rules: config.rules
      .map((rule) => ({ ...rule, conditionals: rule.conditionals.filter((conditional) => isLive(rule, conditional)) }))
      .filter((rule) => rule.conditionals.length > 0),
  };
}

export function validateHighlightConfig(config: HighlightConfig, importIssues: HighlightIssue[] = []): ValidationReport {
  const issues: HighlightIssue[] = [...importIssues];
  const add = (severity: IssueSeverity, code: string, message: string, item: { id: string; source?: HighlightIssue["source"] }) =>
    issues.push({ severity, code, message, id: item.id || undefined, source: item.source });

  const ruleIds = new Map<string, number>();
  const conditionalIds = new Map<string, number>();
  for (const rule of config.rules) {
    if (rule.id) ruleIds.set(rule.id, (ruleIds.get(rule.id) ?? 0) + 1);
    for (const conditional of rule.conditionals) if (conditional.id) conditionalIds.set(conditional.id, (conditionalIds.get(conditional.id) ?? 0) + 1);
  }

  for (const rule of config.rules) {
    if (!rule.id) add("error", "missing-rule-id", "This PARENT row has no Rule ID. Type a permanent ID like HL-001.", rule);
    else if (!RULE_ID_PATTERN.test(rule.id)) add("error", "bad-rule-id", `"${rule.id}" is not a Rule ID. Use the form HL-001.`, rule);
    else if (ruleIds.get(rule.id)! > 1) add("error", "duplicate-id", `Rule ID ${rule.id} is used more than once.`, rule);
    if (!rule.name) add("warning", "missing-rule-name", "This rule has no name in the Rule / conditional column.", rule);
    if (rule.conditionals.length === 0) add("warning", "no-conditionals", `Rule ${rule.id || "(no ID)"} has no CONDITIONAL rows, so it can never send anything.`, rule);
    const detector = rule.id ? detectorFor(rule.id) : null;
    if (rule.status === "Approved" && rule.id && !detector) {
      add("warning", "no-detector", `Rule ${rule.id} has no detector in the app yet. It can be published but won't fire until one is built.`, rule);
    }

    for (const conditional of rule.conditionals) {
      // --- Structure: always errors.
      const idMatch = CONDITIONAL_ID_PATTERN.exec(conditional.id);
      if (!conditional.id) add("error", "missing-conditional-id", `This CONDITIONAL row has no ID. Type a permanent ID like ${RULE_ID_PATTERN.test(rule.id) ? rule.id : "HL-001"}-C01 in the Rule ID column.`, conditional);
      else if (!idMatch) add("error", "bad-conditional-id", `"${conditional.id}" is not a conditional ID. Use the form HL-001-C01.`, conditional);
      else if (idMatch[1] !== rule.id) add("error", "parent-mismatch", `${conditional.id} sits under rule ${rule.id || "(no ID)"}; its ID must start with that rule's ID.`, conditional);
      else if (conditionalIds.get(conditional.id)! > 1) add("error", "duplicate-id", `Conditional ID ${conditional.id} is used more than once.`, conditional);

      if (conditional.status === "Disabled" || rule.status === "Disabled") continue;
      if (conditional.status === "Approved" && rule.status !== "Approved") {
        add("warning", "parent-not-approved", `${conditional.id} is Approved but its rule ${rule.id} is ${rule.status}, so it won't go live.`, conditional);
      }

      // --- Content: errors when live, warnings while still Draft.
      const severity: IssueSeverity = isLive(rule, conditional) ? "error" : "warning";
      for (const [field, text] of [["Headline", conditional.headline], ["Notification text", conditional.body]] as const) {
        if (!text) { add(severity, "missing-copy", `${conditional.id || "This conditional"} has no ${field}.`, conditional); continue; }
        const check = checkTemplate(text);
        for (const problem of check.problems) add(severity, "bad-template", `${field}: ${problem}`, conditional);
        for (const name of check.unknown) add(severity, "unknown-variable", `${field}: {${name}} is not a supported variable.`, conditional);
        if (detector) for (const name of check.variables) {
          if (!check.unknown.includes(name) && !(detector.variables as string[]).includes(name)) {
            add(severity, "variable-not-provided", `${field}: the ${detector.name} detector can't fill in {${name}}.`, conditional);
          }
        }
        if (text.includes(" / ")) add("warning", "multiple-messages", `${field} looks like two messages separated by " / ". Give each its own CONDITIONAL row.`, conditional);
      }
      if (detector) {
        const tiers = detector.tiers;
        if (tiers.kind === "none" && conditional.tier !== null) add(severity, "unsupported-tier", `${detector.name} has no tiers; leave Tier blank.`, conditional);
        if (tiers.kind === "integer" && !(typeof conditional.tier === "number" && conditional.tier >= tiers.min && conditional.tier <= tiers.max)) {
          add(severity, "unsupported-tier", `${detector.name} needs a whole-number Tier from ${tiers.min} to ${tiers.max}${conditional.tier === null ? "" : `, not "${conditional.tier}"`}.`, conditional);
        }
      }
    }

    // Two rows with the same tier would make it ambiguous which message fires.
    const byTier = new Map<string, HighlightConditional[]>();
    for (const conditional of rule.conditionals) {
      if (conditional.tier === null || conditional.status === "Disabled") continue;
      const key = String(conditional.tier).toLowerCase();
      byTier.set(key, [...(byTier.get(key) ?? []), conditional]);
    }
    for (const group of byTier.values()) {
      if (group.length < 2) continue;
      const severity = group.filter((conditional) => isLive(rule, conditional)).length > 1 ? "error" : "warning";
      add(severity, "duplicate-tier", `Tier "${group[0].tier}" is used by ${group.map((c) => c.id || "(no ID)").join(", ")} in rule ${rule.id}.`, group[1]);
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  return { ok: errors.length === 0, errors, warnings: issues.filter((issue) => issue.severity === "warning") };
}
