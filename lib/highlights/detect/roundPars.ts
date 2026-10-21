import type { TripRoundScoring } from "../../platform/tripScoring.ts";
import { startHolesOf, type TripRoundPars } from "../../platform/tripRoundPars.ts";

/**
 * The per-round hole-par snapshot detection is allowed to use. Pure. H5C Part 1 stores it per trip round
 * (the golf_trip_round_pars.sql migration; lib/platform/tripRoundPars.ts); snapshotFromTripPars() maps it here.
 *
 * Audit (2026-10-20): saved Golf Trip rounds store only course_name — no course link and no pars; the saved-trip
 * scoring screen gets an empty par list and shows 4 on every hole. Real pars exist elsewhere but aren't linked to trip
 * rounds: the course library (golf_holes / tee sets, OpenGolf), the Maroon live courses (live_courses.tee_sets), and
 * player rounds (pars copied at save). golf_trip_momentum.sql proposed organizer-entered momentum_pars (never run).
 *
 * Proposal: one snapshot per trip round, taken from the round's course + tee when the course library has it, otherwise
 * typed by the organizer; CONFIRMED by the organizer before tee-off; LOCKED at the first score (a later fix needs the
 * organizer, is audited, and re-runs detection — moments withdraw / re-appear). Detection only ever reads a confirmed
 * snapshot; unconfirmed or missing pars mean "only hole-in-ones" (an ace doesn't need par). Never default to par 4.
 */

export type ParSource = "course-library" | "live-course" | "organizer";
export interface RoundParSnapshot {
  pars: number[];
  source: ParSource;
  /** e.g. the course library record + tee set the pars came from; null when typed by the organizer. */
  sourceRef: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  /** Set at the round's first score; later edits are organizer corrections. */
  lockedAt: string | null;
}

export const validPars = (pars: unknown): pars is number[] =>
  Array.isArray(pars) && pars.length === 18 && pars.every((p) => Number.isInteger(p) && p >= 3 && p <= 6);

/** The pars detection may use, or null with the reason (shown in the shadow report / simulator). */
export function parsForDetection(snapshot: RoundParSnapshot | null | undefined): { pars: number[] | null; reason: string | null } {
  if (!snapshot) return { pars: null, reason: "This round has no par snapshot yet: only hole-in-ones can be detected." };
  if (!validPars(snapshot.pars)) return { pars: null, reason: "The round's par snapshot isn't 18 valid pars (3–6): only hole-in-ones can be detected." };
  if (!snapshot.confirmedAt) return { pars: null, reason: `The round's pars (from ${snapshot.source}) aren't confirmed by the organizer yet: only hole-in-ones can be detected.` };
  return { pars: snapshot.pars, reason: null };
}

/** A saved trip round's confirmed pars (lib/platform/tripRoundPars.ts) as the snapshot detection reads. Saved = confirmed. */
export function snapshotFromTripPars(pars: TripRoundPars | null | undefined): RoundParSnapshot | null {
  if (!pars) return null;
  return {
    pars: pars.pars, source: pars.source === "course" ? "course-library" : "organizer",
    sourceRef: pars.source === "course" ? [pars.courseRef, pars.tee].filter(Boolean).join(":") || null : null,
    // Only the organizer can save pars, so saved pars are confirmed. Pars typed before golf_trip_round_pars.sql have no
    // confirmation time; they still count (marked, never left looking unconfirmed).
    confirmedBy: pars.confirmedBy, confirmedAt: pars.confirmedAt ?? "before-confirmation-times", lockedAt: pars.lockedAt,
  };
}

/** What detectRoundMoments needs from a saved round's scoring: confirmed pars (or null + why) and each group's start hole. */
export function detectionSetup(scoring: TripRoundScoring): { pars: number[] | null; reason: string | null; startHoles: Record<string, number> } {
  return { ...parsForDetection(snapshotFromTripPars(scoring.pars)), startHoles: startHolesOf(scoring.groups) };
}
