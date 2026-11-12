import type { MatchDraftPlayer } from "./matchDraft";

/** A match draft needs the entire loaded roster assigned, uniquely, across both teams. */
export function homeDraftTeamsReady(playerCount: number, players: MatchDraftPlayer[]): boolean {
  return playerCount > 1 && players.length === playerCount
    && new Set(players.map(player => player.id ?? player.name)).size === playerCount
    && players.some(player => player.team === "A") && players.some(player => player.team === "B");
}

/** Both fields are needed before Home treats a draft as scheduled. */
export function homeDraftHasSchedule(date: string, time: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}
