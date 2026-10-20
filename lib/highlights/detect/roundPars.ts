/**
 * The per-round hole-par snapshot detection is allowed to use (H5B proposal; no table or migration yet). Pure.
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
