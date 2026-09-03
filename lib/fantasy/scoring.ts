import { getPlayerScorecard } from "@/lib/data";
import type { Tournament } from "@/lib/data/types";

/**
 * Fantasy points for a single completed hole, based on score relative to
 * par (`diff` = score - par, same field HoleStat already carries).
 * Mirrors the Masters Fantasy Challenge point table:
 *   double bogey or worse -> -2, bogey -> 0, par -> 1, birdie -> 3, eagle or better -> 5.
 */
export function holeFantasyPoints(diff: number): number {
  if (diff <= -2) return 5;
  if (diff === -1) return 3;
  if (diff === 0) return 1;
  if (diff === 1) return 0;
  return -2;
}

/**
 * Total fantasy points for one player, summed over every hole they've
 * completed so far across every round played to date. A hole with score 0
 * hasn't been played yet — same "not yet played" convention
 * LivePlayerScorecard.tsx already uses (`h.score > 0`) — so it's skipped
 * rather than scored as par. Works unchanged for both a completed
 * tournament's static scorecards and the live-merged tournament's
 * feed-sourced scorecards, since both use the same Tournament/PlayerScorecard
 * shape (see lib/data/live.ts's mergeLiveTournament).
 */
export function playerFantasyPoints(tournament: Tournament, player: string): number {
  const scorecard = getPlayerScorecard(tournament, player);
  if (!scorecard) return 0;

  let total = 0;
  for (const round of scorecard.rounds) {
    for (const hole of round.holes) {
      if (hole.score > 0) total += holeFantasyPoints(hole.diff);
    }
  }
  return total;
}

export interface FantasyPicks {
  maroonPlayer: string;
  whitePlayer: string;
  wildcardPlayer: string;
}

export interface FantasyPickScore {
  player: string;
  points: number;
}

export interface FantasyTeamScore {
  picks: FantasyPickScore[];
  total: number;
}

export function fantasyTeamScore(tournament: Tournament, picks: FantasyPicks): FantasyTeamScore {
  const scored: FantasyPickScore[] = [
    { player: picks.maroonPlayer, points: playerFantasyPoints(tournament, picks.maroonPlayer) },
    { player: picks.whitePlayer, points: playerFantasyPoints(tournament, picks.whitePlayer) },
    { player: picks.wildcardPlayer, points: playerFantasyPoints(tournament, picks.wildcardPlayer) },
  ];
  return { picks: scored, total: scored.reduce((sum, p) => sum + p.points, 0) };
}
