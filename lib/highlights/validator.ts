import { detectorFor } from "./catalog.ts";
import { ruleMetaProblems } from "./metadata.ts";
import { BODY_LIMIT, TITLE_LIMIT } from "../notifications/format.ts";
import { checkTemplate, LONG_SAMPLE_VALUES, renderTemplate } from "./template.ts";
import {
  CONDITIONAL_ID_PATTERN, OWN_VARIATION_SUFFIX, RULE_ID_PATTERN, VARIATION_ID_PATTERN, familyOfId, familyOfTab,
  type HighlightConditional, type HighlightConfig, type HighlightIssue, type HighlightRule, type HighlightVariation,
  type IssueSeverity, type ValidationReport,
} from "./types.ts";

/**
 * Step 3 of an import: checks a config before it can be previewed or published. Pure.
 * Structural problems (IDs, duplicates, a rule in the wrong family of tab) are always errors. Content problems (copy,
 * placeholders, tiers, rule metadata) are errors on items that would go live and warnings on Draft items; Disabled items
 * skip content checks. Publish needs ok.
 *
 * Live = rule, conditional and message all Approved. A conditional fires only if it has at least one live message.
 */

/** Rule and conditional both Approved (the trigger is switched on). */
export const isApprovedTrigger = (rule: HighlightRule, conditional: HighlightConditional) => rule.status === "Approved" && conditional.status === "Approved";
/** This message can be picked: rule, conditional and variation all Approved. */
export const isLiveVariation = (rule: HighlightRule, conditional: HighlightConditional, variation: HighlightVariation) =>
  isApprovedTrigger(rule, conditional) && variation.status === "Approved";
/** The conditional can fire: an Approved trigger with at least one message to pick from. */
export const isLive = (rule: HighlightRule, conditional: HighlightConditional) =>
  conditional.variations.some((variation) => isLiveVariation(rule, conditional, variation));

/** Only what would actually go live: live conditionals with only their live variations, under Approved rules. */
export function publishableConfig(config: HighlightConfig): HighlightConfig {
  return {
    schemaVersion: 3,
    rules: config.rules
      .map((rule) => ({
        ...rule,
        conditionals: rule.conditionals
          .filter((conditional) => isLive(rule, conditional))
          .map((conditional) => ({ ...conditional, variations: conditional.variations.filter((v) => isLiveVariation(rule, conditional, v)) })),
      }))
      .filter((rule) => rule.conditionals.length > 0),
  };
}

/** Any emoji (pictographs, incl. ZWJ sequences like 👨‍🍳). Every notification headline is meant to carry one. */
export const HAS_EMOJI = /\p{Extended_Pictographic}/u;

export function validateHighlightConfig(config: HighlightConfig, importIssues: HighlightIssue[] = []): ValidationReport {
  const issues: HighlightIssue[] = [...importIssues];
  const add = (severity: IssueSeverity, code: string, message: string, item: { id: string; source?: HighlightIssue["source"] }) =>
    issues.push({ severity, code, message, id: item.id || undefined, source: item.source });

  const counts = new Map<string, number>();
  const count = (id: string) => { if (id) counts.set(id, (counts.get(id) ?? 0) + 1); };
  for (const rule of config.rules) {
    count(rule.id);
    for (const conditional of rule.conditionals) {
      count(conditional.id);
      for (const variation of conditional.variations) count(variation.id);
    }
  }
  const duplicated = (id: string) => (counts.get(id) ?? 0) > 1;

  for (const rule of config.rules) {
    const family = familyOfTab(rule.category);
    const example = family === "travel" ? "TR-001" : "HL-001";
    if (!rule.id) add("error", "missing-rule-id", `This PARENT row has no Rule ID. Type a permanent ID like ${example}.`, rule);
    else if (!RULE_ID_PATTERN.test(rule.id)) add("error", "bad-rule-id", `"${rule.id}" is not a Rule ID. Use the form ${example}.`, rule);
    else if (familyOfId(rule.id) !== family) add("error", "wrong-family", `${rule.id} is in the "${rule.category}" tab; ${family === "travel" ? "travel rules use TR- IDs" : "golf rules use HL- IDs"}.`, rule);
    else if (duplicated(rule.id)) add("error", "duplicate-id", `Rule ID ${rule.id} is used more than once.`, rule);
    if (!rule.name) add("warning", "missing-rule-name", "This rule has no name in the Rule / conditional column.", rule);
    if (rule.conditionals.length === 0) add("warning", "no-conditionals", `Rule ${rule.id || "(no ID)"} has no CONDITIONAL rows, so it can never send anything.`, rule);
    const detector = rule.id ? detectorFor(rule.id) : null;
    if (rule.status === "Approved" && rule.id && family === "golf" && !detector) {
      add("warning", "no-detector", `Rule ${rule.id} has no detector in the app yet. It can be published but won't fire until one is built.`, rule);
    }
    if (rule.status !== "Disabled") {
      for (const problem of ruleMetaProblems(rule)) add(rule.status === "Approved" ? "error" : "warning", "bad-metadata", `${rule.id || "This rule"}: ${problem.message}`, rule);
    }

    for (const conditional of rule.conditionals) {
      // --- Structure: always errors.
      const idMatch = CONDITIONAL_ID_PATTERN.exec(conditional.id);
      if (!conditional.id) add("error", "missing-conditional-id", `This CONDITIONAL row has no ID. Type a permanent ID like ${RULE_ID_PATTERN.test(rule.id) ? rule.id : example}-C01 in the Rule ID column.`, conditional);
      else if (!idMatch) add("error", "bad-conditional-id", `"${conditional.id}" is not a conditional ID. Use the form ${example}-C01.`, conditional);
      else if (idMatch[1] !== rule.id) add("error", "parent-mismatch", `${conditional.id} sits under rule ${rule.id || "(no ID)"}; its ID must start with that rule's ID.`, conditional);
      else if (duplicated(conditional.id)) add("error", "duplicate-id", `Conditional ID ${conditional.id} is used more than once.`, conditional);

      const hasOwn = conditional.variations.some((v) => v.legacy);
      for (const variation of conditional.variations) {
        if (variation.legacy) continue; // V01's ID comes from the conditional's, checked above
        const match = VARIATION_ID_PATTERN.exec(variation.id);
        const next = `${CONDITIONAL_ID_PATTERN.test(conditional.id) ? conditional.id : `${example}-C01`}-V0${hasOwn ? 2 : 1}`;
        if (!variation.id) add("error", "missing-variation-id", `This VARIATION row has no ID. Type a permanent ID like ${next} in the Rule ID column.`, variation);
        else if (!match) add("error", "bad-variation-id", `"${variation.id}" is not a variation ID. Use the form ${example}-C01-V02.`, variation);
        else if (variation.id.endsWith("-V00")) add("error", "reserved-variation-id", `${variation.id}: variations are numbered from V01 (the CONDITIONAL row's own wording is V01, so VARIATION rows under it start at V02).`, variation);
        else if (match[1] !== conditional.id) add("error", "parent-mismatch", `${variation.id} sits under ${conditional.id || "a conditional with no ID"}; its ID must start with that conditional's ID.`, variation);
        else if (duplicated(variation.id)) {
          const clash = hasOwn && variation.id === conditional.id + OWN_VARIATION_SUFFIX;
          add("error", "duplicate-id", clash ? `${variation.id} is already the CONDITIONAL row's own wording. Number this VARIATION row from V02.` : `Variation ID ${variation.id} is used more than once.`, variation);
        }
      }

      if (conditional.status === "Disabled" || rule.status === "Disabled") continue;
      const trigger = isApprovedTrigger(rule, conditional);
      const triggerSeverity: IssueSeverity = trigger ? "error" : "warning";
      if (conditional.status === "Approved" && rule.status !== "Approved") {
        add("warning", "parent-not-approved", `${conditional.id} is Approved but its rule ${rule.id} is ${rule.status}, so it won't go live.`, conditional);
      }

      // --- Messages.
      if (conditional.variations.length === 0) {
        add(triggerSeverity, "no-messages", `${conditional.id || "This conditional"} has no message. Type a Headline and Notification text on it, or add VARIATION rows under it.`, conditional);
      } else if (trigger && !isLive(rule, conditional)) {
        add("warning", "no-approved-variation", `${conditional.id} is Approved but none of its messages are, so it won't fire yet.`, conditional);
      }

      const seen = new Map<string, string>();
      for (const variation of conditional.variations) {
        if (variation.status === "Disabled") continue;
        if (!variation.legacy && variation.status === "Approved" && !trigger) {
          add("warning", "parent-not-approved", `${variation.id} is Approved but ${conditional.id} or its rule isn't, so it won't go live.`, variation);
        }
        const severity: IssueSeverity = isLiveVariation(rule, conditional, variation) ? "error" : "warning";
        const name = variation.id || "This message";
        for (const [field, text] of [["Headline", variation.headline], ["Notification text", variation.body]] as const) {
          if (!text) { add(severity, "missing-copy", `${name} has no ${field}.`, variation); continue; }
          const check = checkTemplate(text);
          for (const problem of check.problems) add(severity, "bad-template", `${field}: ${problem}`, variation);
          for (const unknown of check.unknown) add(severity, "unknown-variable", `${field}: {${unknown}} is not a supported placeholder.`, variation);
          if (detector) for (const used of check.variables) {
            if (!check.unknown.includes(used) && !(detector.variables as string[]).includes(used)) {
              add(severity, "variable-not-provided", `${field}: the ${detector.name} detector can't fill in {${used}}.`, variation);
            }
          }
          if (text.includes(" / ")) add("warning", "multiple-messages", `${field} looks like two messages separated by " / ". Give each its own row: a VARIATION if it's another wording for the same moment, a CONDITIONAL if it's a different moment.`, variation);
          // Phones cut longer text with "…" (lib/notifications/format.ts). Measured the same way: text.length.
          const limit = field === "Headline" ? TITLE_LIMIT : BODY_LIMIT;
          const longest = renderTemplate(text, LONG_SAMPLE_VALUES);
          if (longest.ok && longest.text.length > limit) {
            add("warning", "may-be-too-long", `${field} can reach ${longest.text.length} characters with long names; phones show ${limit} and cut the rest with "…".`, variation);
          }
        }
        if (variation.headline && !HAS_EMOJI.test(variation.headline)) add("warning", "headline-no-emoji", `${name}'s headline has no emoji.`, variation);
        const wording = `${variation.headline}\n${variation.body}`;
        if (seen.has(wording)) add("warning", "duplicate-variation", `${name} has the same wording as ${seen.get(wording)}.`, variation);
        else seen.set(wording, name);
      }

      // --- Tier: checked against what the detector can do.
      if (detector) {
        const tiers = detector.tiers;
        if (tiers.kind === "none" && conditional.tier !== null) add(triggerSeverity, "unsupported-tier", `${detector.name} has no tiers; leave Tier blank.`, conditional);
        if (tiers.kind === "integer" && !(typeof conditional.tier === "number" && conditional.tier >= tiers.min && conditional.tier <= tiers.max)) {
          add(triggerSeverity, "unsupported-tier", `${detector.name} needs a whole-number Tier from ${tiers.min} to ${tiers.max}${conditional.tier === null ? "" : `, not "${conditional.tier}"`}.`, conditional);
        }
      }
    }

    // Two triggers with the same tier would make it ambiguous which one fires.
    const byTier = new Map<string, HighlightConditional[]>();
    for (const conditional of rule.conditionals) {
      if (conditional.tier === null || conditional.status === "Disabled") continue;
      const key = String(conditional.tier).toLowerCase();
      byTier.set(key, [...(byTier.get(key) ?? []), conditional]);
    }
    for (const group of byTier.values()) {
      if (group.length < 2) continue;
      const severity = group.filter((conditional) => isApprovedTrigger(rule, conditional)).length > 1 ? "error" : "warning";
      add(severity, "duplicate-tier", `Tier "${group[0].tier}" is used by ${group.map((c) => c.id || "(no ID)").join(", ")} in rule ${rule.id}.`, group[1]);
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  return { ok: errors.length === 0, errors, warnings: issues.filter((issue) => issue.severity === "warning") };
}
