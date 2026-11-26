/**
 * The Golf tab's line when a round has no matches yet (website MatchDraftStatus, also the Expo app): the round's Match
 * Draft date / time and the seconds left, or null when no Match Draft is set ("No Match Draft has been set. Ask Your Organizer").
 * Pure: the trip's saved settings, the round number and "now" in milliseconds come in.
 */
type Choice = { method?: string; date?: string; time?: string };

export type MatchDraftStatus = { date: string; time: string; target: number };

export function matchDraftStatus(setup: Record<string, unknown>, round: number): MatchDraftStatus | null {
  // Find the round's day and its place in that day (roundsPerDay: day index → rounds that day, 1 when missing).
  const counts = setup.roundsPerDay as Record<string, number> | undefined;
  let remaining = round - 1, day = 0;
  for (; day < 64; day++) { const count = counts?.[day] ?? 1; if (remaining < count) break; remaining -= count; }
  const own = (setup.matchSelections as Record<string, Choice> | undefined)?.[`${day}-${remaining}`];
  const choice = setup.matchPerRound ? own : setup.allRoundsMatch as Choice | undefined;
  const date = own?.date || choice?.date, time = own?.time || choice?.time;
  const target = choice?.method === "Match Draft" && date && time ? new Date(`${date}T${time}`).getTime() : NaN;
  return Number.isFinite(target) ? { date: date!, time: time!, target } : null;
}

/** "1d 2h 3m 4s" until the draft, "Draft time reached" once it's time. */
export function matchDraftCountdown(target: number, nowMs: number): string {
  const seconds = Math.max(0, Math.ceil(target / 1000 - Math.floor(nowMs / 1000)));
  if (seconds === 0) return "Draft time reached";
  return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`;
}
