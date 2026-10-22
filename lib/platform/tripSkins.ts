import type { GolfMatchPreview, RoundSkins } from "./golfTripPreviewFixture";

/**
 * Trip skins (owner rule 2026-10-21): everyone in the round's skins game plays one skins game. A hole's skin goes to
 * the one player with the lowest score; if two or more tie for low, nobody gets it (no carryover). A hole only counts
 * once everyone in skins has a score on it. Gross scores.
 *
 * Settings come from the organizer's Competition → Skins (any trip): on / off, each round on unless switched off, and
 * each round's players (positions on the trip roster; everyone unless changed).
 */

/** Player positions saved as a Set, a {$set: [...]} (saved trips), or a list. */
const positions = (value: unknown): number[] | null =>
  value instanceof Set ? [...value] : Array.isArray(value) ? value : value && typeof value === "object" && Array.isArray((value as { $set?: unknown }).$set) ? (value as { $set: number[] }).$set : null;

/** Each skins round and who's in it (names; null = everyone on the leaderboard). `key` = "<day index>-<slot>". */
export function skinsRoundsFrom(rounds: { number: number; dayNumber: number }[], settings: { skinsOn?: unknown; skinsRounds?: unknown; skinsPlayers?: unknown }, roster: string[]): RoundSkins[] {
  if (settings.skinsOn !== true) return [];
  const onRounds = (settings.skinsRounds ?? {}) as Record<string, boolean>, players = (settings.skinsPlayers ?? {}) as Record<string, unknown>;
  return rounds.flatMap((round): RoundSkins[] => {
    const slot = rounds.filter((r) => r.dayNumber === round.dayNumber).findIndex((r) => r.number === round.number);
    const key = `${round.dayNumber - 1}-${slot}`;
    if (onRounds[key] === false) return [];
    const picked = positions(players[key]);
    return [{ round: round.number, players: picked ? picked.map((i) => roster[i]).filter((name): name is string => !!name) : null }];
  });
}

/** Skins won this round by each player in it, or null when this round has no skins. */
export function skinsCount(match: GolfMatchPreview): Map<string, number> | null {
  const round = match.skins?.find((s) => s.round === match.round);
  if (!round) return null;
  const rows = match.leaderboard.filter((row) => !round.players || round.players.includes(row.golfer.name));
  const counts = new Map(rows.map((row) => [row.golfer.name, 0]));
  if (rows.length < 2) return counts;
  for (let h = 0; h < 18; h++) {
    const scores = rows.map((row) => row.holes[h]);
    if (scores.some((s) => s == null)) continue;
    const low = Math.min(...(scores as number[]));
    const winners = rows.filter((_, i) => scores[i] === low);
    if (winners.length === 1) counts.set(winners[0].golfer.name, (counts.get(winners[0].golfer.name) ?? 0) + 1);
  }
  return counts;
}
