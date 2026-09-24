import type { HandicapCourseTeeSet, ShotDirection } from "./types";
import type { ScorecardHoleRow } from "@/lib/portal/scorecard";

/** Shape of one hole's entry in HandicapHoleEntry's in-progress draft. */
export interface ScorecardDraftEntry {
  score: string;
  putts: string;
  fir: boolean;
  gir: boolean;
  firDirection: ShotDirection | null;
  girDirection: ShotDirection | null;
}

/** Same completeness rule HandicapHoleEntry's own submit validation uses: putts must be set, GIR must be set (hit or a miss direction), and fairway must be set too unless the hole is a par 3. Score always holds a par default from the moment the draft is created, so it alone can't signal "not entered yet". */
function isHoleEntered(entry: ScorecardDraftEntry, par: number): boolean {
  if (entry.putts === "") return false;
  if (!entry.gir && !entry.girDirection) return false;
  if (par !== 3 && !entry.fir && !entry.firDirection) return false;
  return true;
}

/**
 * Maps the in-progress hole-entry draft into scorecard rows. A hole that
 * hasn't actually been filled in yet is shown as not-entered (all nulls)
 * even though the draft already holds a par-default score for it.
 */
export function buildScorecardRows(teeSet: HandicapCourseTeeSet, draft: Record<number, ScorecardDraftEntry>): ScorecardHoleRow[] {
  return teeSet.holes.map((hole) => {
    const entry = draft[hole.number];
    const par3 = hole.par === 3;
    if (!entry || !isHoleEntered(entry, hole.par)) {
      return { hole: hole.number, par: hole.par, yards: hole.yards, score: null, putts: null, fir: null, firDirection: null, gir: null, girDirection: null };
    }
    return {
      hole: hole.number,
      par: hole.par,
      yards: hole.yards,
      score: Number(entry.score),
      putts: Number(entry.putts),
      fir: par3 ? null : entry.fir,
      firDirection: par3 ? null : entry.firDirection,
      gir: entry.gir,
      girDirection: entry.girDirection,
    };
  });
}
