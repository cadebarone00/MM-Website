// lib/broadcast/matchEvents.ts
//
// Pure detection of match-box/round broadcast-worthy transitions, given
// matchBoxResult() computed before and after a stroke write. No I/O — same
// style as lib/live/orchestration.ts. See
// docs/superpowers/specs/2026-09-04-broadcast-event-queue-design.md
// (Trigger Points, item 3) for why this diffs matchBoxResult() rather than
// effectiveMatchState(): the latter has no concept of an early closeout.
import type { MatchBoxResult } from "@/lib/live/orchestration";
import type { RawMatchStateChangedEvent, RawMatchWonEvent, RawRoundFinalEvent } from "./types";

function isClosed(result: Pick<MatchBoxResult, "maroonPts" | "whitePts">): boolean {
  return result.maroonPts > 0 || result.whitePts > 0;
}

/**
 * Given a match box's result before and after a stroke write, decide what
 * (if anything) to publish. Returns null if nothing meaningfully changed.
 * A newly-closed box always wins over a state-changed classification for
 * the same write (master spec §13's dedup philosophy — one underlying
 * change, one event).
 */
export function detectMatchBoxEvent(
  before: MatchBoxResult,
  after: MatchBoxResult,
  matchBoxId: string,
  seasonYear: number,
  round: number
): RawMatchStateChangedEvent | RawMatchWonEvent | null {
  const wasClosed = isClosed(before);
  const isNowClosed = isClosed(after);

  if (!wasClosed && isNowClosed) {
    return {
      kind: "MATCH_WON",
      seasonYear,
      matchBoxId,
      round,
      leader: after.leader,
      margin: after.margin,
      maroonPts: after.maroonPts,
      whitePts: after.whitePts,
    };
  }

  if (wasClosed) return null; // already decided — don't re-fire on a later, moot hole in the same box

  if (before.leader === after.leader && before.margin === after.margin && before.holesRemaining === after.holesRemaining) {
    return null;
  }

  return {
    kind: "MATCH_STATE_CHANGED",
    seasonYear,
    matchBoxId,
    round,
    leader: after.leader,
    margin: after.margin,
    holesRemaining: after.holesRemaining,
  };
}

/** Round-complete transition — fires only on the false -> true edge. */
export function detectRoundFinal(beforeComplete: boolean, afterComplete: boolean, seasonYear: number, round: number): RawRoundFinalEvent | null {
  if (beforeComplete || !afterComplete) return null;
  return { kind: "ROUND_FINAL", seasonYear, round };
}
