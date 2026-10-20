import type { TemplateVariable } from "./template.ts";

/**
 * What each TypeScript detector can do. The sheet may change copy and choose tiers, but only within these limits —
 * a tier or variable a detector can't produce is a validation error, not a silent no-op.
 * A rule ID missing from here has no detector yet: it can be stored and published but never fires.
 * Add an entry only together with (or right before) its detector.
 */

export type TierSupport =
  | { kind: "none" }
  | { kind: "integer"; min: number; max: number };

export interface DetectorCapability {
  ruleId: string;
  name: string;
  tiers: TierSupport;
  /** Variables the detector fills in for every event. */
  variables: TemplateVariable[];
}

export const DETECTOR_CATALOG: readonly DetectorCapability[] = [
  // Owner decision 2026-10-16: birdie streaks fire from 3 in a row, tiers 3–10.
  { ruleId: "HL-001", name: "Birdie streak", tiers: { kind: "integer", min: 3, max: 10 }, variables: ["Player", "Count", "Hole", "Round", "Course"] },
  // H5B (2026-10-20): TypeScript detectors in lib/highlights/detect/scoreMoments.ts (shadow mode only).
  { ruleId: "HL-002", name: "Eagle", tiers: { kind: "none" }, variables: ["Player", "Hole", "Round", "Course"] },
  { ruleId: "HL-003", name: "Albatross", tiers: { kind: "none" }, variables: ["Player", "Hole", "Round", "Course"] },
  { ruleId: "HL-004", name: "Hole-in-one", tiers: { kind: "none" }, variables: ["Player", "Hole", "Round", "Course"] },
];

export function detectorFor(ruleId: string): DetectorCapability | null {
  return DETECTOR_CATALOG.find((entry) => entry.ruleId === ruleId) ?? null;
}
