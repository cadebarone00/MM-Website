import { ruleProfile, type RuleProfile } from "../metadata.ts";
import { renderTemplate, type TemplateValues } from "../template.ts";
import type { HighlightConditional, HighlightConfig, HighlightRule, HighlightVariation } from "../types.ts";
import { recipients, type AudienceContext } from "./audience.ts";
import { eligibleForTrip, type CompetitionProfile } from "./competition.ts";
import { destinationFor } from "./destinations.ts";
import { intensityIncludes, type AlertPreferences } from "./preferences.ts";
import { pickVariation } from "./selection.ts";

/**
 * Decides one alert for one recipient and renders it. Pure — the same logic the simulator shows and production will
 * use (spec: "Decision for one recipient"). Six checks, all reported (never short-circuited) so the simulator can explain:
 *   1 competition / activity enabled · 2 recipient in the audience · 3 category on · 4 golf intensity includes the rule
 *   5 rule + trigger + a wording Approved · 6 every placeholder of the chosen wording can be filled.
 * Outcome: "not-created" if 1, 2, 5 or 6 fail; "muted" if only 3 / 4 fail (kept in the trip's history, no push / inbox);
 * otherwise "delivered". The wording is picked once here; the caller stores it with the event.
 */

export interface AlertEvent {
  tripId: string;
  ruleId: string;
  /** Picks the conditional: an explicit ID, else the one whose Tier matches, else the rule's only conditional. */
  conditionalId?: string | null;
  tier?: number | string | null;
  values: TemplateValues;
  /** Travel: the itinerary item it's about (null for trip-wide announcements). */
  itemId?: string | null;
  /** Travel alerts needing a live fact (flight disruption): true only when a feed or the organizer confirmed it. */
  confirmed?: boolean;
  /** Idempotency key (delivery.ts). */
  key: string;
}

export interface EvaluateOptions {
  config: HighlightConfig;
  /** The published version it came from (null in previews). Stored with the event. */
  configVersion: number | null;
  competition: CompetitionProfile;
  audience: AudienceContext;
  recipientId: string;
  preferences: AlertPreferences;
  /** Simulator: let Draft rules / wordings through (labeled) so unapproved copy can be reviewed. Never in production. */
  previewDrafts?: boolean;
  /** Force a wording by ID (simulator V1 / V2 / V3); otherwise random with anti-repetition. */
  forcedVariation?: string | null;
  recent?: string[];
  random?: () => number;
}

export type CheckId = "competition" | "audience" | "category" | "intensity" | "approved" | "placeholders";
export interface Check { id: CheckId; label: string; status: "pass" | "fail" | "warn" | "skip"; detail: string }

export interface RenderedAlert {
  ruleId: string; conditionalId: string; variationId: string; configVersion: number | null;
  title: string; body: string; link: string; linkLabel: string;
  family: "golf" | "travel"; category: RuleProfile["category"];
  /** Rendered from Draft copy in a preview — would not be sent in production. */
  draft: boolean;
}
export interface Evaluation { outcome: "delivered" | "muted" | "not-created"; checks: Check[]; alert: RenderedAlert | null; summary: string }

const LABELS: Record<CheckId, string> = {
  competition: "Competition / activity enabled", audience: "Recipient is in the audience", category: "Category is on",
  intensity: "Golf intensity includes it", approved: "Rule and wording approved", placeholders: "Every placeholder can be filled",
};

export function findConditional(rule: HighlightRule, event: Pick<AlertEvent, "conditionalId" | "tier">): HighlightConditional | null {
  if (event.conditionalId) return rule.conditionals.find((c) => c.id === event.conditionalId) ?? null;
  if (event.tier !== undefined && event.tier !== null) {
    const wanted = String(event.tier).toLowerCase();
    return rule.conditionals.find((c) => c.tier !== null && String(c.tier).toLowerCase() === wanted) ?? null;
  }
  return rule.conditionals.length === 1 ? rule.conditionals[0] : null;
}

export function evaluateAlert(event: AlertEvent, options: EvaluateOptions): Evaluation {
  const checks: Check[] = [];
  const check = (id: CheckId, status: Check["status"], detail: string) => checks.push({ id, label: LABELS[id], status, detail });
  const rule = options.config.rules.find((r) => r.id === event.ruleId);
  if (!rule) {
    for (const id of Object.keys(LABELS) as CheckId[]) check(id, id === "approved" ? "fail" : "skip", id === "approved" ? `Rule ${event.ruleId} isn't in this configuration.` : "—");
    return { outcome: "not-created", checks, alert: null, summary: `Not created: rule ${event.ruleId} isn't in this configuration.` };
  }
  const profile = ruleProfile(rule);

  // 1 — competition (golf) / activity (travel).
  if (!profile) check("competition", "fail", "The rule's metadata (category, eligibility, alert level / audience, trigger, source) can't be read.");
  else if (profile.family === "golf") {
    const eligible = eligibleForTrip(profile.eligibility!, options.competition);
    check("competition", eligible.ok ? "pass" : "fail", eligible.reason);
  } else if (profile.source === "live-or-manual" && !event.confirmed) {
    check("competition", "fail", "Needs a confirmed status (an airline feed or the organizer). The app never assumes live airline or rideshare data.");
  } else if (profile.audience !== "selected" && profile.trigger?.type !== "event" && !event.itemId) {
    check("competition", "fail", "There's no itinerary item for this reminder.");
  } else check("competition", "pass", profile.source === "live-or-manual" ? "Confirmed status supplied." : event.itemId ? "The itinerary item exists." : "Trip-wide message.");

  // 2 — audience.
  const scope = profile?.family === "travel" ? profile.audience! : "trip-members";
  const audience = recipients(scope, options.audience);
  check("audience", audience.includes(options.recipientId) ? "pass" : "fail",
    audience.includes(options.recipientId) ? `In the audience (${audience.length} ${audience.length === 1 ? "person" : "people"}).` : `Not in the audience (${audience.length} other ${audience.length === 1 ? "person" : "people"} get it).`);

  // 3 — category preference.
  if (!profile) check("category", "skip", "—");
  else check("category", options.preferences.categories[profile.category] ? "pass" : "fail", `${profile.category} is ${options.preferences.categories[profile.category] ? "on" : "off for this person"}.`);

  // 4 — golf intensity (travel ignores it).
  if (!profile) check("intensity", "skip", "—");
  else if (profile.family === "travel") check("intensity", "skip", "Travel alerts don't use golf intensity.");
  else {
    const ok = intensityIncludes(options.preferences.golf, profile.alertLevel!);
    check("intensity", ok ? "pass" : "fail", `Rule level ${profile.alertLevel}; setting ${options.preferences.golf}.`);
  }

  // 5 — approval.
  const conditional = findConditional(rule, event);
  const allowed = (status: string) => status === "Approved" || (options.previewDrafts && status === "Draft");
  let candidates: HighlightVariation[] = [];
  if (!conditional) check("approved", "fail", `No trigger of ${rule.id} matches ${event.tier !== undefined && event.tier !== null ? `tier "${event.tier}"` : "this event"}.`);
  else if (!allowed(rule.status) || !allowed(conditional.status)) check("approved", "fail", `${rule.status !== "Approved" ? `${rule.id} is ${rule.status}` : `${conditional.id} is ${conditional.status}`}.`);
  else {
    candidates = conditional.variations.filter((v) => allowed(v.status));
    const draft = [rule.status, conditional.status].includes("Draft") || candidates.some((v) => v.status === "Draft");
    if (!candidates.length) check("approved", "fail", `${conditional.id} has no Approved wording.`);
    else check("approved", draft ? "warn" : "pass", draft ? `Draft copy previewed (${candidates.length} wording${candidates.length === 1 ? "" : "s"}) — would NOT be sent until Approved.` : `${candidates.length} Approved wording${candidates.length === 1 ? "" : "s"}.`);
  }

  // 6 — placeholders: skip wordings this event can't fill; pick from the rest.
  const missingOf = (v: HighlightVariation) => [renderTemplate(v.headline, event.values), renderTemplate(v.body, event.values)]
    .flatMap((r) => (r.ok ? [] : [...r.missing, ...r.problems]));
  const usable = candidates.filter((v) => missingOf(v).length === 0);
  const skipped = candidates.filter((v) => missingOf(v).length > 0);
  const forcedBad = options.forcedVariation && skipped.find((v) => v.id === options.forcedVariation);
  const picked = forcedBad ? { variation: null } : pickVariation(usable, { recent: options.recent ?? [], random: options.random ?? Math.random, forced: options.forcedVariation });
  if (!candidates.length) check("placeholders", "skip", "—");
  else if (!picked.variation) check("placeholders", "fail", forcedBad ? `${forcedBad.id} needs {${missingOf(forcedBad).join("}, {")}} — not known for this event.` : `No wording can be filled: ${skipped.map((v) => `${short(v.id)} needs {${missingOf(v).join("}, {")}}`).join("; ")}.`);
  else check("placeholders", "pass", `${short(picked.variation.id)} fills completely.${skipped.length ? ` Skipped: ${skipped.map((v) => `${short(v.id)} (needs {${missingOf(v).join("}, {")}})`).join(", ")}.` : ""}`);

  const failed = (id: CheckId) => checks.find((c) => c.id === id)?.status === "fail";
  const blocked = (["competition", "audience", "approved", "placeholders"] as CheckId[]).filter(failed);
  const muted = (["category", "intensity"] as CheckId[]).filter(failed);
  let alert: RenderedAlert | null = null;
  if (!blocked.length && picked.variation && conditional && profile) {
    const v = picked.variation;
    const destination = destinationFor(event.tripId, rule, profile.category, event.itemId);
    alert = {
      ruleId: rule.id, conditionalId: conditional.id, variationId: v.id, configVersion: options.configVersion,
      title: (renderTemplate(v.headline, event.values) as { text: string }).text, body: (renderTemplate(v.body, event.values) as { text: string }).text,
      link: destination.path, linkLabel: destination.label, family: profile.family, category: profile.category,
      draft: [rule.status, conditional.status, v.status].includes("Draft"),
    };
  }
  const outcome = blocked.length ? "not-created" : muted.length ? "muted" : "delivered";
  const summary = outcome === "delivered" ? `Delivered${alert?.draft ? " (Draft copy — preview only)" : ""}: ${alert?.title}`
    : outcome === "muted" ? `Muted by preferences (${muted.map((id) => LABELS[id].toLowerCase()).join(", ")}): kept in the trip's history, no push or inbox entry.`
    : `Not created: ${blocked.map((id) => LABELS[id].toLowerCase()).join(", ")} failed.`;
  return { outcome, checks, alert, summary };
}

const short = (variationId: string) => variationId.slice(-3);
