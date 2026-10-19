/**
 * Highlights Engine configuration (project_specs.md → "Highlights Engine", decisions 2026-10-16, -17 and -19).
 *
 * The Google Sheet "The_Maroon_Highlights_Source_of_Truth" is the editable rulebook; only its seven category tabs are
 * read: six golf tabs (rules HL-001 …) and Travel and itinerary alerts (rules TR-001 …). Each tab lists PARENT rows (one
 * rule), each followed by CONDITIONAL rows (one trigger / outcome tier, ID "HL-001-C03"), each followed by VARIATION rows
 * (more wordings, ID "HL-001-C03-V02"), with blank separator rows between rules. Detection and scheduling logic stay in
 * TypeScript; the sheet controls tiers, copy and the rule's notification metadata.
 *
 * The CONDITIONAL row's own Headline / Notification text is its first wording, variation "<conditional ID>-V01"
 * (schema 3). Stored schema-2 configs used "-V00" for it and are upgraded on read (upgrade.ts).
 */

/** The six golf tabs, then the travel tab — exactly as named in the sheet. Every other tab is ignored. */
export const GOLF_TABS = [
  "Individual performance",
  "Match play drama",
  "Team competition",
  "Individual leaderboard",
  "Trip and tournament milestones",
  "Fun and social highlights",
] as const;
export const TRAVEL_TAB = "Travel and itinerary alerts";
export const HIGHLIGHT_TABS = [...GOLF_TABS, TRAVEL_TAB] as const;
export type HighlightCategory = (typeof HIGHLIGHT_TABS)[number];

/** Golf highlights are detected from scores; travel alerts come from the itinerary (scheduled or on edits). */
export type HighlightFamily = "golf" | "travel";
export const familyOfTab = (tab: HighlightCategory): HighlightFamily => (tab === TRAVEL_TAB ? "travel" : "golf");
export const familyOfId = (id: string): HighlightFamily | null => (id.startsWith("HL-") ? "golf" : id.startsWith("TR-") ? "travel" : null);

/**
 * Columns, matched by header name (any order, case and spacing ignored). The first name is the golf tabs', later ones
 * are the travel tab's spelling. Only the REQUIRED ones must exist; the rest are read when present.
 */
export const HIGHLIGHT_COLUMNS = {
  id: ["Rule ID"],
  rowType: ["Row type"],
  label: ["Rule / conditional"],
  tier: ["Tier"],
  version: ["Version", "Variation"],
  headline: ["Headline"],
  body: ["Notification text"],
  status: ["Status"],
  notes: ["Detection notes", "Notes"],
  notificationCategory: ["Notification Category", "Category"],
  competitionEligibility: ["Competition Eligibility"],
  minimumAlertLevel: ["Minimum Alert Level"],
  audience: ["Audience"],
  reminderTrigger: ["Reminder / trigger"],
  sourceRequirement: ["Source requirement"],
} as const;
export type HighlightColumn = keyof typeof HIGHLIGHT_COLUMNS;
export const REQUIRED_COLUMNS: readonly HighlightColumn[] = ["id", "rowType", "label", "headline", "body", "status"];
/** The six golf columns of the original layout, by their golf-tab names (kept for fixtures and messages). */
export const HIGHLIGHT_HEADERS = Object.fromEntries(Object.entries(HIGHLIGHT_COLUMNS).map(([key, names]) => [key, names[0]])) as { [K in HighlightColumn]: (typeof HIGHLIGHT_COLUMNS)[K][0] };

/** Rule metadata from the PARENT row, stored exactly as typed ("" when absent). metadata.ts interprets it. */
export const RULE_META_KEYS = ["notificationCategory", "competitionEligibility", "minimumAlertLevel", "audience", "reminderTrigger", "sourceRequirement"] as const;
export type RuleMetaKey = (typeof RULE_META_KEYS)[number];
export type RuleMeta = Record<RuleMetaKey, string>;
export const emptyRuleMeta = (): RuleMeta => ({ notificationCategory: "", competitionEligibility: "", minimumAlertLevel: "", audience: "", reminderTrigger: "", sourceRequirement: "" });

/** Only Approved items can go live: a message is eligible when it, its conditional AND its parent rule are all Approved. */
export const HIGHLIGHT_STATUSES = ["Draft", "Approved", "Disabled"] as const;
export type HighlightStatus = (typeof HIGHLIGHT_STATUSES)[number];

export const RULE_ID_PATTERN = /^(?:HL|TR)-\d{3}$/;
export const CONDITIONAL_ID_PATTERN = /^((?:HL|TR)-\d{3})-C\d{2}$/;
export const VARIATION_ID_PATTERN = /^((?:HL|TR)-\d{3}-C\d{2})-V\d{2}$/;
/** The CONDITIONAL row's own wording is "<conditional ID>-V01" (schema 3). */
export const OWN_VARIATION_SUFFIX = "-V01";
/** Schema 2's suffix for that wording; only ever seen in stored v2 configs. */
export const V2_OWN_VARIATION_SUFFIX = "-V00";

/** Where a row came from, for error messages only — never used as an identity. */
export interface SheetLocation { tab: string; row: number }

/** One wording of a conditional's notification. One is picked at random per event (see project_specs.md). */
export interface HighlightVariation {
  /** "HL-001-C01-V02"; "HL-001-C01-V01" for the CONDITIONAL row's own wording. */
  id: string;
  /** Optional short name from the "Rule / conditional" column. */
  label: string;
  headline: string;
  body: string;
  status: HighlightStatus;
  notes: string;
  /** True for the wording typed on the CONDITIONAL row itself (V01; V00 in schema 2). It shares that row's status. */
  legacy: boolean;
  /** Present on freshly imported configs; stripped from canonical/stored ones. */
  source?: SheetLocation;
}

/** One trigger / outcome tier of a rule, e.g. "4 consecutive birdies". Detection only looks at rule + tier. */
export interface HighlightConditional {
  id: string;
  /** Human label from the "Rule / conditional" column. */
  condition: string;
  /** Whole number (e.g. 4 birdies), a text label (e.g. "Team of 2"), or null when the rule has no tiers. */
  tier: number | string | null;
  status: HighlightStatus;
  /** The messages. A conditional that can go live must have at least one live variation (validator). */
  variations: HighlightVariation[];
  notes: string;
  /** Present on freshly imported configs; stripped from canonical/stored ones (see canonical.ts). */
  source?: SheetLocation;
}

/** One rule, e.g. "Birdie streak" or "Flight tomorrow". */
export interface HighlightRule {
  id: string;
  /** The tab it came from (also says golf vs travel). */
  category: HighlightCategory;
  name: string;
  status: HighlightStatus;
  notes: string;
  meta: RuleMeta;
  conditionals: HighlightConditional[];
  /** Present on freshly imported configs; stripped from canonical/stored ones. */
  source?: SheetLocation;
}

/** Version 3 = seven tabs, rule metadata, own wording = V01 (2026-10-19). Version 2 is read through upgrade.ts. */
export interface HighlightConfig {
  schemaVersion: 3;
  rules: HighlightRule[];
}

export type IssueSeverity = "error" | "warning";
export interface HighlightIssue {
  severity: IssueSeverity;
  /** Short machine code, e.g. "duplicate-id". */
  code: string;
  message: string;
  /** Rule, conditional or variation ID when known. */
  id?: string;
  source?: SheetLocation;
}

export interface ValidationReport {
  /** True when there are no errors — the only state in which a draft may be published. */
  ok: boolean;
  errors: HighlightIssue[];
  warnings: HighlightIssue[];
}
