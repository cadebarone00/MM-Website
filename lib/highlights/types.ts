/**
 * Highlights Engine configuration (project_specs.md → "Highlights Engine", decisions 2026-10-16).
 *
 * The Google Sheet "The_Maroon_Highlights_Source_of_Truth" is the editable rulebook; only its six category tabs are
 * read. Each tab lists PARENT rows (one detection rule, ID "HL-001"), each followed by CONDITIONAL rows (one trigger /
 * outcome tier, ID "HL-001-C03"), each optionally followed by VARIATION rows (one message wording, ID "HL-001-C03-V02"),
 * with blank separator rows between rules. Detection logic stays in TypeScript; the sheet controls tiers and copy.
 *
 * Legacy single-message conditionals (copy typed on the CONDITIONAL row itself, no VARIATION rows) still work: that
 * copy becomes the conditional's one built-in variation "<conditional ID>-V00", with the conditional's status.
 */

/** The six authoritative category tabs, exactly as named in the sheet. Every other tab is ignored. */
export const HIGHLIGHT_TABS = [
  "Individual performance",
  "Match play drama",
  "Team competition",
  "Individual leaderboard",
  "Trip and tournament milestones",
  "Fun and social highlights",
] as const;
export type HighlightCategory = (typeof HIGHLIGHT_TABS)[number];

/** Column headers every category tab must have (matched by name, not position). */
export const HIGHLIGHT_HEADERS = {
  id: "Rule ID",
  rowType: "Row type",
  label: "Rule / conditional",
  tier: "Tier",
  headline: "Headline",
  body: "Notification text",
  status: "Status",
  notes: "Detection notes",
} as const;
export type HighlightColumn = keyof typeof HIGHLIGHT_HEADERS;

/** Only Approved items can go live: a message is eligible when it, its conditional AND its parent rule are all Approved. */
export const HIGHLIGHT_STATUSES = ["Draft", "Approved", "Disabled"] as const;
export type HighlightStatus = (typeof HIGHLIGHT_STATUSES)[number];

export const RULE_ID_PATTERN = /^HL-\d{3}$/;
export const CONDITIONAL_ID_PATTERN = /^(HL-\d{3})-C\d{2}$/;
export const VARIATION_ID_PATTERN = /^(HL-\d{3}-C\d{2})-V\d{2}$/;
/** Reserved suffix for a legacy conditional's own message. Never typed on a VARIATION row. */
export const LEGACY_VARIATION_SUFFIX = "-V00";

/** Where a row came from, for error messages only — never used as an identity. */
export interface SheetLocation { tab: string; row: number }

/** One wording of a conditional's notification. One is picked at random per event (see project_specs.md). */
export interface HighlightVariation {
  /** "HL-001-C01-V02", or "HL-001-C01-V00" for a legacy conditional's own message. */
  id: string;
  /** Optional short name from the "Rule / conditional" column. */
  label: string;
  headline: string;
  body: string;
  status: HighlightStatus;
  notes: string;
  /** True for the built-in V00 made from copy typed on the CONDITIONAL row. */
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

/** One detection concept, e.g. "Birdie streak". */
export interface HighlightRule {
  id: string;
  category: HighlightCategory;
  name: string;
  status: HighlightStatus;
  notes: string;
  conditionals: HighlightConditional[];
  /** Present on freshly imported configs; stripped from canonical/stored ones. */
  source?: SheetLocation;
}

/** Version 2 = message variations (2026-10-17). Version 1 (one message per conditional) was never stored. */
export interface HighlightConfig {
  schemaVersion: 2;
  rules: HighlightRule[];
}

export type IssueSeverity = "error" | "warning";
export interface HighlightIssue {
  severity: IssueSeverity;
  /** Short machine code, e.g. "duplicate-id". */
  code: string;
  message: string;
  /** Rule or conditional ID when known. */
  id?: string;
  source?: SheetLocation;
}

export interface ValidationReport {
  /** True when there are no errors — the only state in which a draft may be published. */
  ok: boolean;
  errors: HighlightIssue[];
  warnings: HighlightIssue[];
}
