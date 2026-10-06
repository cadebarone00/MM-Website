import type { PlayerRound } from "./playerRounds";

/** Trip stats (add-on "What shows where"): per-player totals across the trip's saved rounds, plus a trip-wide row. */
export interface TripStatsRow { profileId: string; rounds: number; scoringAvg: number; puttsAvg: number | null; fairwayPct: number | null; greenPct: number | null }
export type TripStatsTotals = Omit<TripStatsRow, "profileId">;

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

function summarize(rounds: PlayerRound[]): TripStatsTotals {
  const holes = rounds.flatMap((round) => round.holes);
  const puttRounds = rounds.filter((round) => round.holes.length > 0 && round.holes.every((h) => h.putts !== null));
  const fairways = holes.filter((h) => h.par !== 3 && h.fairway !== null), greens = holes.filter((h) => h.green !== null);
  const pct = (hit: number, of: number) => of ? Math.round((hit / of) * 100) : null;
  return {
    rounds: rounds.length,
    scoringAvg: oneDecimal(rounds.reduce((sum, round) => sum + round.total, 0) / rounds.length),
    puttsAvg: puttRounds.length ? oneDecimal(puttRounds.reduce((sum, round) => sum + round.holes.reduce((s, h) => s + (h.putts ?? 0), 0), 0) / puttRounds.length) : null,
    fairwayPct: pct(fairways.filter((h) => h.fairway === "center").length, fairways.length),
    greenPct: pct(greens.filter((h) => h.green === "center").length, greens.length),
  };
}

/** Rounds removed from a player's profile still count here: the trip keeps them (decision 15). */
export function tripStats(rounds: PlayerRound[], tripId: string): { players: TripStatsRow[]; trip: TripStatsTotals | null } {
  const tripRounds = rounds.filter((round) => round.source === "trip" && round.tripId === tripId);
  if (!tripRounds.length) return { players: [], trip: null };
  const byPlayer = new Map<string, PlayerRound[]>();
  for (const round of tripRounds) byPlayer.set(round.profileId, [...(byPlayer.get(round.profileId) ?? []), round]);
  const players = [...byPlayer].map(([profileId, list]) => ({ profileId, ...summarize(list) })).sort((a, b) => a.scoringAvg - b.scoringAvg);
  return { players, trip: summarize(tripRounds) };
}
