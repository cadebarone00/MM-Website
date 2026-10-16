/**
 * Highlights Engine configuration (project_specs.md → "Highlights Engine", decisions 2026-10-16).
 *
 * The Google Sheet "The_Maroon_Highlights_Source_of_Truth" is the editable rulebook; only its six category tabs are
 * read. Each tab lists PARENT rows (one detection rule, ID "HL-001") followed by CONDITIONAL rows (one outcome tier,
 * ID "HL-001-C03") and blank separator rows. Detection logic stays in TypeScript; the sheet controls copy and tiers.
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

/** Only Approved items can go live; a conditional needs its own AND its parent rule's status to be Approved. */
export const HIGHLIGHT_STATUSES = ["Draft", "Approved", "Disabled"] as const;
export type HighlightStatus = (typeof HIGHLIGHT_STATUSES)[number];

export const RULE_ID_PATTERN = /^HL-\d{3}$/;
export const CONDITIONAL_ID_PATTERN = /^(HL-\d{3})-C\d{2}$/;

/** Where a row came from, for error messages only — never used as an identity. */
export interface SheetLocation { tab: string; row: number }

/** One outcome tier of a rule, e.g. "4 consecutive birdies". */
export interface HighlightConditional {
  id: string;
  /** Human label from the "Rule / conditional" column. */
  condition: string;
  /** Whole number (e.g. 4 birdies), a text label (e.g. "Team of 2"), or null when the rule has no tiers. */
  tier: number | string | null;
  headline: string;
  body: string;
  status: HighlightStatus;
  notes: string;
  source: SheetLocation;
}

/** One detection concept, e.g. "Birdie streak". */
export interface HighlightRule {
  id: string;
  category: HighlightCategory;
  name: string;
  status: HighlightStatus;
  notes: string;
  conditionals: HighlightConditional[];
  source: SheetLocation;
}

export interface HighlightConfig {
  schemaVersion: 1;
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
