import { effectiveMatchState, matchBoxResult, matchBoxStartedThru } from "@/lib/live/orchestration";
import type { LiveMatchBox, LiveTournamentSnapshot } from "@/lib/live/types";

export type OfficialMatchStatus = "upcoming" | "live" | "complete" | "closed_out";

export type OfficialMatchState = {
  status: OfficialMatchStatus;
  thru: number;
  maroonHoles: number;
  whiteHoles: number;
  leader: "maroon" | "white" | "tie";
  margin: number;
  mathematicallyComplete: boolean;
  officialResult: "maroon" | "white" | "tie" | null;
};

/**
 * Derives the sole public match-state payload from a snapshot containing
 * confirmed scores only. It deliberately knows nothing about drafts or
 * scorer devices: callers must filter those before invoking it.
 */
export function buildOfficialMatchState(snapshot: LiveTournamentSnapshot, box: LiveMatchBox, now = new Date()): OfficialMatchState {
  const startedState = effectiveMatchState(snapshot, box, now);
  const result = matchBoxResult(snapshot, box);
  const thru = matchBoxStartedThru(snapshot, box);
  const mathematicallyComplete = result.margin > result.holesRemaining || thru === 18;
  const officialResult = mathematicallyComplete ? result.leader : null;
  const status: OfficialMatchStatus = mathematicallyComplete ? "complete" : startedState === "Live" ? "live" : "upcoming";

  return {
    status,
    thru,
    maroonHoles: result.maroonPts > 0 ? result.margin : 0,
    whiteHoles: result.whitePts > 0 ? result.margin : 0,
    leader: result.leader,
    margin: result.margin,
    mathematicallyComplete,
    officialResult,
  };
}
