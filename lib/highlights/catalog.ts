import type { TemplateVariable } from "./template.ts";

/**
 * What each TypeScript detector can do. The sheet may change copy and choose tiers, but only within these limits —
 * a tier or variable a detector can't produce is a validation error, not a silent no-op.
 * A rule ID missing from here has no detector yet: it can be stored and published but never fires.
 * Add an entry only together with (or right before) its detector.
 */

export type TierSupport =
  | { kind: "none" }
  | { kind: "integer"; min: number; max: number }
  /** Match-play rules: blank, or a match format (Single / Singles, Fourball / Team of 2 / Pairs, Team of 3+). */
  | { kind: "format" };

export interface DetectorCapability {
  ruleId: string;
  name: string;
  tiers: TierSupport;
  /** Variables the detector fills in for every event. */
  variables: TemplateVariable[];
}

const MATCH_VARIABLES: TemplateVariable[] = ["Player 1, Team A", "Player 2, Team A", "Player 1, Team B", "Player 2, Team B", "Team A", "Team B", "Opponent", "Player", "Count", "Margin", "Hole", "Round", "Course"];

export const DETECTOR_CATALOG: readonly DetectorCapability[] = [
  // Owner decision 2026-10-16: birdie streaks fire from 3 in a row, tiers 3–10.
  { ruleId: "HL-001", name: "Birdie streak", tiers: { kind: "integer", min: 3, max: 10 }, variables: ["Player", "Count", "Hole", "Round", "Course"] },
  // H5B (2026-10-20): TypeScript detectors in lib/highlights/detect/scoreMoments.ts (shadow mode only).
  { ruleId: "HL-002", name: "Eagle", tiers: { kind: "none" }, variables: ["Player", "Hole", "Round", "Course"] },
  { ruleId: "HL-003", name: "Albatross", tiers: { kind: "none" }, variables: ["Player", "Hole", "Round", "Course"] },
  { ruleId: "HL-004", name: "Hole-in-one", tiers: { kind: "none" }, variables: ["Player", "Hole", "Round", "Course"] },
  // 2026-11-27: match play (lib/highlights/detect/matchMoments.ts), gross only. HL-020 (upset) waits for player rankings.
  ...([
    ["HL-011", "Back to all square"], ["HL-012", "3 holes in a row"], ["HL-013", "Comeback from 3+ down"], ["HL-014", "Lead change"],
    ["HL-015", "Dormie"], ["HL-016", "Match goes to the last hole"], ["HL-017", "Won on the last hole"], ["HL-018", "Match halved"],
    ["HL-019", "Match clinched"], ["HL-021", "Big win (4&3 or better)"],
  ] as const).map(([ruleId, name]): DetectorCapability => ({ ruleId, name, tiers: { kind: "format" }, variables: MATCH_VARIABLES })),
];

export function detectorFor(ruleId: string): DetectorCapability | null {
  return DETECTOR_CATALOG.find((entry) => entry.ruleId === ruleId) ?? null;
}
