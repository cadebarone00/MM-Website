// lib/broadcast/priority.ts
//
// Default priority tiers (master spec §13) and the sort-time aging
// calculation. No I/O.
import type { BroadcastEventKind } from "./types";

export const DEFAULT_PRIORITIES: Record<BroadcastEventKind, number> = {
  ROUND_STARTED: 0,
  SCORE_POSTED: 10,
  MATCH_STATE_CHANGED: 40,
  MATCH_WON: 70,
  ROUND_FINAL: 75,
};

const MAX_AGING_BONUS = 30;
const AGING_PER_MINUTE = 2;

/**
 * A queued event's effective priority for sort purposes: base priority
 * plus up to MAX_AGING_BONUS extra, accruing at AGING_PER_MINUTE per
 * minute waited — so a medium-priority event that's been waiting a long
 * time eventually surfaces instead of being starved (master spec §13).
 * Sort-time only, never stored.
 */
export function effectivePriority(priority: number, createdAt: string, now: Date): number {
  const minutesWaiting = Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / 60000);
  return priority + Math.min(MAX_AGING_BONUS, minutesWaiting * AGING_PER_MINUTE);
}
