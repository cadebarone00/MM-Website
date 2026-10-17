import { normalizeCompetitor, type GolfMatchPreview } from "./golfTripPreviewFixture";
import type { GameConfig, GameCourse, GamePlayer, HoleInput } from "./roundGames";

/**
 * Golf trip → Games (owner request 2026-10-17): the same games as Play a round (lib/platform/roundGames.ts — scored by
 * the same `scoreGame`), played only with people in your group, for a round you choose, scored from the round's
 * scorecard (the leaderboard's hole scores).
 */

/** A trip game as saved: which round, the game and its options, the players (by name), each hole's extra pick, and
 *  whether the pre-round options are done (`started`). */
export interface TripGame { key: string; round: number; config: GameConfig; players: string[]; inputs: HoleInput[]; started?: boolean }

/** Who I am on the trip: the signed-in player (matched by name), else the first player of the first match. */
export function meOn(match: GolfMatchPreview, signedInName?: string | null): string | undefined {
  const want = signedInName?.trim().toLowerCase();
  const mine = want ? match.leaderboard.find((row) => row.golfer.name.trim().toLowerCase() === want)?.golfer.name : undefined;
  if (mine) return mine;
  const first = match.matches[0];
  return (first ? normalizeCompetitor(first.left).golfers[0]?.name : undefined) ?? match.leaderboard[0]?.golfer.name;
}

/**
 * My group for the round: everyone on my tee time (when tee times split the field into groups of 2–5), otherwise the
 * players in my match (a four-ball is a group). Me first.
 */
export function groupOf(match: GolfMatchPreview, me: string): string[] {
  const myTee = match.leaderboard.find((row) => row.golfer.name === me)?.golfer.teeTime;
  const byTee = myTee ? match.leaderboard.filter((row) => row.golfer.teeTime === myTee).map((row) => row.golfer.name) : [];
  let group = byTee.length >= 2 && byTee.length <= 5 ? byTee : [];
  if (!group.length) {
    const pairing = match.matches.find((p) => [p.left, p.right].some((side) => side && normalizeCompetitor(side).golfers.some((g) => g.name === me)));
    group = pairing ? [pairing.left, pairing.right].flatMap((side) => side ? normalizeCompetitor(side).golfers.map((g) => g.name) : []) : [me];
  }
  return [me, ...group.filter((name) => name !== me)];
}

/** The game's players with handicaps (0 in preview data = unknown, as elsewhere). */
export function gamePlayers(match: GolfMatchPreview, names: string[]): GamePlayer[] {
  return names.map((name) => { const hcp = match.leaderboard.find((row) => row.golfer.name === name)?.golfer.hcp; return { name, handicap: hcp ? hcp : null }; });
}

/** Each player's hole scores from the round's scorecard; empty when the shown round isn't the game's round. */
export function gameStrokes(match: GolfMatchPreview, game: Pick<TripGame, "round" | "players">): (number | null)[][] {
  return game.players.map((name) => match.round === game.round ? [...(match.leaderboard.find((row) => row.golfer.name === name)?.holes ?? [])] : [])
    .map((holes) => match.par.map((_, h) => holes[h] ?? null));
}

/** The hole being played: the first hole someone in the game hasn't scored (the last hole once everyone's done). */
export function currentHole(strokes: (number | null)[][], holes: number): number {
  const next = Array.from({ length: holes }, (_, h) => h).find((h) => strokes.some((row) => row[h] == null));
  return next ?? holes - 1;
}

/** Holes everyone in the game has scored. */
export const holesThru = (strokes: (number | null)[][], holes: number) => Array.from({ length: holes }, (_, h) => h).filter((h) => strokes.every((row) => row[h] != null)).length;

export const gameCourse = (match: GolfMatchPreview): GameCourse => ({ par: match.par, rating: null, slope: null });
