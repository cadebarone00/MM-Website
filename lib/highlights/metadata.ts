import { familyOfTab, type HighlightRule, type RuleMetaKey } from "./types.ts";

/**
 * Interprets the rule metadata typed on PARENT rows (rule.meta). Pure. The sheet's wording is the vocabulary below —
 * anything else is reported by the validator, never guessed. Spec: project_specs.md → "Highlights Phase H4.5 + H5A".
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };
const fail = (message: string): Parsed<never> => ({ ok: false, message });
const norm = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

// --- Trip competition types (golf eligibility) ----------------------------------------------------------------------

export const TRIP_TYPES = ["match+individual", "match-only", "individual-only", "noncompetitive"] as const;
export type TripType = (typeof TRIP_TYPES)[number];
export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  "match+individual": "Match + Individual", "match-only": "Match Only", "individual-only": "Individual Only", noncompetitive: "Noncompetitive",
};

export interface Eligibility {
  tripTypes: TripType[];
  /** "(team competition active)": an overall team competition must exist. */
  requiresTeamCompetition: boolean;
  /** "(tournament configured)": some competition must be set up. */
  requiresTournament: boolean;
}

/** "Match + Individual; Match Only (team competition active)" → those trip types + the requirement. */
export function parseEligibility(text: string): Parsed<Eligibility> {
  if (!text.trim()) return fail("Competition Eligibility is blank.");
  let rest = text.trim(), requiresTeamCompetition = false, requiresTournament = false;
  const condition = /\(([^)]*)\)\s*$/.exec(rest);
  if (condition) {
    const words = norm(condition[1]);
    if (words === "team competition active") requiresTeamCompetition = true;
    else if (words === "tournament configured") requiresTournament = true;
    else return fail(`Unknown condition "(${condition[1]})". Use "(team competition active)" or "(tournament configured)".`);
    rest = rest.slice(0, condition.index).trim();
  }
  if (norm(rest) === "all trip types") return { ok: true, value: { tripTypes: [...TRIP_TYPES], requiresTeamCompetition, requiresTournament } };
  const tripTypes: TripType[] = [];
  for (const part of rest.split(";").map((p) => p.trim()).filter(Boolean)) {
    const match = TRIP_TYPES.find((type) => norm(TRIP_TYPE_LABELS[type]) === norm(part));
    if (!match) return fail(`Unknown trip type "${part}". Use All trip types, or any of: ${Object.values(TRIP_TYPE_LABELS).join("; ")}.`);
    if (!tripTypes.includes(match)) tripTypes.push(match);
  }
  return tripTypes.length ? { ok: true, value: { tripTypes, requiresTeamCompetition, requiresTournament } } : fail("Competition Eligibility lists no trip types.");
}

// --- Golf intensity -------------------------------------------------------------------------------------------------

/** Ranked: a rule's minimum level reaches every user setting at or above it. */
export const ALERT_LEVELS = ["big-plays", "balanced", "all"] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];
export const ALERT_LEVEL_LABELS: Record<AlertLevel, string> = { "big-plays": "Big Plays", balanced: "Balanced", all: "All" };

export function parseAlertLevel(text: string): Parsed<AlertLevel> {
  const found = ALERT_LEVELS.find((level) => norm(ALERT_LEVEL_LABELS[level]) === norm(text) || (level === "all" && norm(text) === "all highlights"));
  return found ? { ok: true, value: found } : fail(text.trim() ? `Unknown alert level "${text}". Use Big Plays, Balanced or All.` : "Minimum Alert Level is blank.");
}

// --- Preference categories ------------------------------------------------------------------------------------------

export const PREFERENCE_CATEGORIES = ["trip-essentials", "golf-performance", "match-competition", "individual-leaderboard", "flights-transportation", "group-announcements", "fun-social"] as const;
export type PreferenceCategory = (typeof PREFERENCE_CATEGORIES)[number];
export const PREFERENCE_CATEGORY_LABELS: Record<PreferenceCategory, string> = {
  "trip-essentials": "Trip essentials", "golf-performance": "Golf performance", "match-competition": "Match and competition",
  "individual-leaderboard": "Individual leaderboard", "flights-transportation": "Flights and transportation",
  "group-announcements": "Group announcements", "fun-social": "Fun and social",
};

/** The sheet's Notification Category (golf) / Category (travel) → the user-facing preference it belongs to. */
const SHEET_CATEGORIES: Record<string, PreferenceCategory> = {
  "individual performance": "golf-performance",
  "match play drama": "match-competition",
  "team competition": "match-competition",
  "individual leaderboard": "individual-leaderboard",
  "trip and tournament milestones": "trip-essentials",
  "fun and social highlights": "fun-social",
  flights: "flights-transportation",
  transportation: "flights-transportation",
  "golf schedule": "trip-essentials",
  lodging: "trip-essentials",
  "trip changes": "trip-essentials",
  "trip milestones": "trip-essentials",
  "group activities": "group-announcements",
  "organizer messages": "group-announcements",
};

export function parsePreferenceCategory(text: string): Parsed<PreferenceCategory> {
  const found = SHEET_CATEGORIES[norm(text)];
  return found ? { ok: true, value: found } : fail(text.trim() ? `Unknown category "${text}".` : "Category is blank.");
}

// --- Audience (travel) ----------------------------------------------------------------------------------------------

/** Who a travel alert goes to, resolved against the trip's itinerary (audience.ts). */
export const AUDIENCE_SCOPES = ["trip", "item-travelers", "transport-group", "round-players", "tee-group", "event-attendees", "selected"] as const;
export type AudienceScope = (typeof AUDIENCE_SCOPES)[number];
const SHEET_AUDIENCES: Record<string, AudienceScope> = {
  "flight travelers": "item-travelers",
  "affected travelers": "item-travelers",
  "lodging guests": "item-travelers",
  "assigned travelers and driver": "transport-group",
  "carpool members and driver": "transport-group",
  "rental group and driver": "transport-group",
  "ride passengers": "transport-group",
  "round players": "round-players",
  "affected round players": "round-players",
  "assigned tee group": "tee-group",
  "event attendees": "event-attendees",
  "affected attendees": "event-attendees",
  "selected audience or everyone": "selected",
  "entire trip or selected travelers": "selected",
};

export function parseAudience(text: string): Parsed<AudienceScope> {
  const found = SHEET_AUDIENCES[norm(text)];
  return found ? { ok: true, value: found } : fail(text.trim() ? `Unknown audience "${text}".` : "Audience is blank.");
}

// --- Trigger / reminder timing (travel) -----------------------------------------------------------------------------

export type Trigger =
  | { type: "before"; minutes: number }            // a fixed time before the item starts
  | { type: "evening-before"; localTime: "19:00" } // trip-local 7 PM the day before
  | { type: "event"; event: "edit" | "verified-change" | "organizer-publish" | "immediate" | "cancellation" };

export function parseTrigger(text: string): Parsed<Trigger> {
  const t = norm(text);
  const before = /^(\d+)\s*(m|h)\s+before$/.exec(t);
  if (before) return { ok: true, value: { type: "before", minutes: Number(before[1]) * (before[2] === "h" ? 60 : 1) } };
  if (t === "evening before") return { ok: true, value: { type: "evening-before", localTime: "19:00" } };
  const events: Record<string, Extract<Trigger, { type: "event" }>["event"]> = {
    "on edit": "edit", "on verified change": "verified-change", "on organizer publish": "organizer-publish", immediate: "immediate", "on cancellation": "cancellation",
  };
  if (events[t]) return { ok: true, value: { type: "event", event: events[t] } };
  return fail(text.trim() ? `Unknown reminder / trigger "${text}". Use e.g. "24h before", "30m before", "Evening before", "On edit", "Immediate".` : "Reminder / trigger is blank.");
}

/** What the alert depends on. "live-or-manual" alerts need a confirmed fact (a feed or an organizer) — never assumed. */
export const SOURCE_REQUIREMENTS = ["schedule", "itinerary-edit", "live-or-manual", "manual"] as const;
export type SourceRequirement = (typeof SOURCE_REQUIREMENTS)[number];
export function parseSourceRequirement(text: string): Parsed<SourceRequirement> {
  const found: Record<string, SourceRequirement> = { scheduled: "schedule", "itinerary edit": "itinerary-edit", "live feed/manual confirmation": "live-or-manual", "manual send": "manual" };
  const value = found[norm(text)];
  return value ? { ok: true, value } : fail(text.trim() ? `Unknown source requirement "${text}".` : "Source requirement is blank.");
}

// --- A rule's interpreted profile -----------------------------------------------------------------------------------

export interface RuleProfile {
  family: "golf" | "travel";
  category: PreferenceCategory;
  /** Golf only. */
  eligibility: Eligibility | null;
  alertLevel: AlertLevel | null;
  /** Travel only. */
  audience: AudienceScope | null;
  trigger: Trigger | null;
  source: SourceRequirement | null;
}

/** Which metadata each family needs, and how to read it. */
const NEEDS: Record<"golf" | "travel", { key: RuleMetaKey; parse: (text: string) => Parsed<unknown> }[]> = {
  golf: [
    { key: "notificationCategory", parse: parsePreferenceCategory },
    { key: "competitionEligibility", parse: parseEligibility },
    { key: "minimumAlertLevel", parse: parseAlertLevel },
  ],
  travel: [
    { key: "notificationCategory", parse: parsePreferenceCategory },
    { key: "audience", parse: parseAudience },
    { key: "reminderTrigger", parse: parseTrigger },
    { key: "sourceRequirement", parse: parseSourceRequirement },
  ],
};

/** Every metadata problem of a rule (empty = its profile can be read). */
export function ruleMetaProblems(rule: HighlightRule): { key: RuleMetaKey; message: string }[] {
  return NEEDS[familyOfTab(rule.category)].flatMap(({ key, parse }) => {
    const parsed = parse(rule.meta?.[key] ?? "");
    return parsed.ok ? [] : [{ key, message: parsed.message }];
  });
}

/** The rule's interpreted metadata, or null when any of it can't be read (the validator explains why). */
export function ruleProfile(rule: HighlightRule): RuleProfile | null {
  if (ruleMetaProblems(rule).length) return null;
  const family = familyOfTab(rule.category);
  const value = <T,>(parsed: Parsed<T>) => (parsed as { ok: true; value: T }).value;
  const category = value(parsePreferenceCategory(rule.meta.notificationCategory));
  if (family === "golf") {
    return { family, category, eligibility: value(parseEligibility(rule.meta.competitionEligibility)), alertLevel: value(parseAlertLevel(rule.meta.minimumAlertLevel)), audience: null, trigger: null, source: null };
  }
  return { family, category, eligibility: null, alertLevel: null, audience: value(parseAudience(rule.meta.audience)), trigger: value(parseTrigger(rule.meta.reminderTrigger)), source: value(parseSourceRequirement(rule.meta.sourceRequirement)) };
}
