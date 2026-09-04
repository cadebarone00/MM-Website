// lib/broadcast/eventDisplay.ts
//
// Pure logic for deciding what to show from the broadcast_events queue and
// how to word it. No I/O. See
// docs/superpowers/specs/2026-09-04-broadcast-overlay-takeover-design.md.
import type { BroadcastEventRow } from "./queue";
import type { BroadcastEventKind, BroadcastTeam } from "./types";

export type BroadcastEventDisplayMode = "overlay" | "takeover";

export interface ActiveBroadcastEvent {
  id: string;
  kind: BroadcastEventKind;
  displayMode: BroadcastEventDisplayMode;
  payload: Record<string, unknown>;
}

/**
 * Explicit per-kind lookup, never inferred from priority number (spec's
 * own instruction — priority is for queue ordering, not display
 * treatment). SCORE_POSTED/ROUND_STARTED are deliberately absent — they
 * never leave status "pending" (Phase 2's rules engine), so getNextInQueue
 * (status in queued/ready only) can never hand them to this function in
 * the first place; the absence here is a second line of defense, not the
 * only one.
 */
export const DISPLAY_MODE_BY_KIND: Partial<Record<BroadcastEventKind, BroadcastEventDisplayMode>> = {
  MATCH_STATE_CHANGED: "overlay",
  MATCH_WON: "takeover",
  ROUND_FINAL: "takeover",
};

/**
 * First not-yet-shown row with a known display mode. `events` is expected
 * already priority-sorted (getNextInQueue/sortQueueRows do that) — this
 * never re-sorts. A row whose kind isn't in DISPLAY_MODE_BY_KIND is
 * skipped with a console.warn rather than shown malformed or crashing —
 * see the spec's Edge Cases.
 */
export function pickActiveEvent(events: BroadcastEventRow[], shownIds: ReadonlySet<string>): ActiveBroadcastEvent | null {
  for (const event of events) {
    if (shownIds.has(event.id)) continue;
    const displayMode = DISPLAY_MODE_BY_KIND[event.kind];
    if (!displayMode) {
      console.warn(`broadcast: no display mode for event kind "${event.kind}" (id ${event.id}) — skipping.`);
      continue;
    }
    return { id: event.id, kind: event.kind, displayMode, payload: event.payload };
  }
  return null;
}

/** "AS" or "N UP" — an in-progress (not yet closed) match's status. */
export function marginLabel(margin: number): string {
  return margin === 0 ? "AS" : `${margin} UP`;
}

/**
 * "N & M" (closed early) or "N UP" (closed at the last playable hole) — a
 * CLOSED match's final result. Same formula components/broadcast/scenes/MatchPlayScene.tsx's
 * private statusLabel() already uses for the exact same distinction —
 * kept as a separate, exported, unit-tested function here rather than
 * importing that scene's private helper, since it isn't exported and this
 * module needs it independently testable.
 */
export function closedMarginLabel(margin: number, holesRemaining: number): string {
  return margin > holesRemaining && holesRemaining > 0 ? `${margin} & ${holesRemaining}` : `${margin} UP`;
}

export function teamLabel(team: BroadcastTeam | "tie"): string {
  return team === "maroon" ? "Maroon" : team === "white" ? "White" : "Tie";
}
