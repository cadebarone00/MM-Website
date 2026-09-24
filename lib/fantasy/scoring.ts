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

/**
 * Fantasy points for one player, for one specific round only — same rule as
 * playerFantasyPoints, just scoped to a single round.round for the "My
 * Roster" round-by-round strip. Null means that round hasn't started for
 * this player yet (no scorecard row for it, or no holes posted), which the
 * UI shows as a blank circle rather than a zero.
 */
export function playerFantasyPointsForRound(tournament: Tournament, player: string, round: number): number | null {
  const scorecard = getPlayerScorecard(tournament, player);
  const roundCard = scorecard?.rounds.find((r) => r.round === round);
  if (!roundCard) return null;

  const played = roundCard.holes.filter((h) => h.score > 0);
  if (played.length === 0) return null;

  return played.reduce((total, hole) => total + holeFantasyPoints(hole.diff), 0);
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

/**
 * The team's combined fantasy points for one specific round, for the "My
 * Roster" round-by-round strip. Null (shown as a blank circle) until at
 * least one of the three picks has posted a hole in that round; once any
 * of them has, the others simply contribute 0 for that round so far,
 * matching how the tournament-wide total already treats an unplayed hole.
 */
export function fantasyPointsForRound(tournament: Tournament, picks: FantasyPicks, round: number): number | null {
  const perPlayer = [picks.maroonPlayer, picks.whitePlayer, picks.wildcardPlayer].map((player) =>
    playerFantasyPointsForRound(tournament, player, round)
  );
  if (perPlayer.every((points) => points === null)) return null;
  return perPlayer.reduce((total: number, points) => total + (points ?? 0), 0);
}
