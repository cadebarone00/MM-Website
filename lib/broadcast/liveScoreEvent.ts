// lib/broadcast/liveScoreEvent.ts
//
// Pure diff: compares two consecutive `standings` snapshots (the shape
// useLiveBroadcastData already re-fetches on every live_hole_scores
// change) and says whether that update was a birdie/eagle/bogey worth
// celebrating on the real (non-mock) Individual Leaderboard scene — see
// the 2026-09-22 broadcast graphics brainstorm. No I/O, no course/par
// lookup needed: `todayToPar`'s change between snapshots already encodes
// the hole's result relative to par, since it only moves when a hole is
// confirmed. Deliberately reuses the mock rehearsal's 3-kind vocabulary
// (birdie/eagle/bogey, see components/broadcast/scenes/IndividualLeaderboardScene.tsx)
// rather than inventing a 4th (e.g. hole-in-one) — distinguishing a
// hole-in-one from a regular eagle needs the raw stroke count, which
// isn't in this shape; that's a follow-up, not this pass.
import type { BroadcastStanding } from "./types";

export interface LiveScoreEvent {
  player: string;
  eventKind: "birdie" | "eagle" | "bogey";
}

function eventKindForDelta(delta: number): LiveScoreEvent["eventKind"] | null {
  if (delta <= -2) return "eagle";
  if (delta === -1) return "birdie";
  if (delta >= 1) return "bogey";
  return null; // par — not worth interrupting the board for
}

/**
 * `prev`/`next` are matched by `player` slug. A player only counts as
 * "just scored" when `thru` increased (guards against a snapshot that
 * changed for an unrelated reason, e.g. a different player's row moving
 * this one up/down the table). If more than one player advanced in the
 * same refresh (two scores landed between polls), the most dramatic
 * result wins — a router deciding between a simultaneous birdie and
 * bogey should show the birdie.
 */
export function detectLiveScoreEvent(prev: BroadcastStanding[], next: BroadcastStanding[]): LiveScoreEvent | null {
  const prevBySlug = new Map(prev.map((s) => [s.player, s]));
  let best: { delta: number; event: LiveScoreEvent } | null = null;

  for (const standing of next) {
    const before = prevBySlug.get(standing.player);
    if (!before) continue; // first snapshot ever seen for this player — nothing to diff against
    const prevThru = before.thru ?? 0;
    const nextThru = standing.thru ?? 0;
    if (nextThru <= prevThru) continue;

    const delta = (standing.todayToPar ?? 0) - (before.todayToPar ?? 0);
    const kind = eventKindForDelta(delta);
    if (!kind) continue;
    if (!best || delta < best.delta) best = { delta, event: { player: standing.player, eventKind: kind } };
  }

  return best?.event ?? null;
}
