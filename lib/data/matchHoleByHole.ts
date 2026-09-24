import { getRoundScorecard } from "@/lib/data";
import type { RealMatch, Team, Tournament } from "@/lib/data/types";

export interface MatchHoleStatus {
  hole: number;
  par: number;
  maroonScore: number;
  whiteScore: number;
  /** Cumulative maroon-minus-white hole-win tally through this hole (positive = maroon up). */
  tally: number;
  /** Running match-status label after this hole — "1 UP", "2 UP", "AS", etc. */
  label: string;
  /** Which side the label favors, or null when the match is all square. */
  leader: Team | null;
}

export interface MatchHoleByHole {
  maroonPlayers: string[];
  whitePlayers: string[];
  /** Individual scorecard values, used when a four-player match shows both teammates. */
  playerHoles: Record<string, Array<{ hole: number; par: number; score: number }>>;
  /** Scores for every hole in the players' scorecards, including holes after a match was clinched. */
  allHoles: Array<Pick<MatchHoleStatus, "hole" | "par" | "maroonScore" | "whiteScore">>;
  /** Running match status through the last hole that counted toward the match result. */
  holes: MatchHoleStatus[];
}

// Only Fourball (best ball) and Singles (direct score comparison) can be
// reconstructed from the individual player scorecards. Alt Shot plays a
// single shared ball per team, and the source data never recorded that
// shared score into the two teammates' individual scorecards — their
// "score" fields for an Alt Shot session are each player's own unrelated
// full round, not the team's ball. So there's nothing to reconstruct.
const SUPPORTED_FORMATS = new Set(["Fourball", "Singles"]);

function sessionOrder(session: RealMatch["session"]): number {
  return session === "Morning" ? 0 : 1;
}

/**
 * Individual scorecards are numbered sequentially by round, but Alt Shot
 * sessions were never captured as individual hole-by-hole rounds (see
 * above) — so round numbers skip those sessions entirely rather than
 * lining up 1:1 with every day/session. This walks the tournament's
 * day/session order, drops any session that's Alt-Shot-only, and assigns
 * the remaining sessions round numbers 1, 2, 3… in order.
 *
 * Verified against the 2026 Palm Springs data: round 1 = Day 1 Morning,
 * round 2 = Day 2 Morning, round 3 = Day 2 Afternoon, round 4 = Day 3
 * Morning, round 5 = Day 4 Morning, round 6 = Day 4 Afternoon. Day 1 & 3
 * Afternoon (both all-Alt-Shot sessions) have no round of their own. Every
 * Fourball/Singles match's hole-by-hole best-ball/direct comparison using
 * this mapping reproduces that match's recorded margin exactly.
 */
function deriveRoundBySession(tournament: Tournament): Map<string, number> {
  const formatsBySession = new Map<string, Set<string>>();
  const order: string[] = [];
  const sorted = [...tournament.matches].sort((a, b) => a.day - b.day || sessionOrder(a.session) - sessionOrder(b.session));
  for (const m of sorted) {
    const key = `${m.day}-${m.session}`;
    if (!formatsBySession.has(key)) {
      formatsBySession.set(key, new Set());
      order.push(key);
    }
    formatsBySession.get(key)!.add(m.format);
  }

  const dataSessions = order.filter((key) => {
    const formats = formatsBySession.get(key)!;
    return !(formats.size === 1 && formats.has("Alt Shot"));
  });

  const map = new Map<string, number>();
  dataSessions.forEach((key, i) => map.set(key, i + 1));
  return map;
}

function teamHoleScores(tournament: Tournament, players: string[], round: number): { scores: number[]; pars: number[] } | null {
  const rounds = players.map((p) => getRoundScorecard(tournament, p, round));
  if (rounds.length === 0 || rounds.some((r) => !r || r.holes.length < 18)) return null;

  const first = rounds[0]!;
  const scores: number[] = [];
  const pars: number[] = [];
  for (let i = 0; i < first.holes.length; i++) {
    const holeScores = rounds.map((r) => r!.holes[i].score);
    scores.push(Math.min(...holeScores));
    pars.push(first.holes[i].par);
  }
  return { scores, pars };
}

function individualHoleScores(tournament: Tournament, players: string[], round: number): Record<string, Array<{ hole: number; par: number; score: number }>> | null {
  const entries = players.map((player) => {
    const scorecard = getRoundScorecard(tournament, player, round);
    if (!scorecard || scorecard.holes.length < 18) return null;
    return [player, scorecard.holes.map((hole) => ({ hole: hole.hole, par: hole.par, score: hole.score }))] as const;
  });

  if (entries.some((entry) => entry == null)) return null;
  return Object.fromEntries(entries as [string, Array<{ hole: number; par: number; score: number }>][]) as Record<string, Array<{ hole: number; par: number; score: number }>>;
}

/** The signed maroon-minus-white tally the match should land on at its clinching hole, or null if it can't be determined. */
function expectedFinalTally(match: RealMatch): number | null {
  if (match.maroonPts === match.whitePts) return 0;
  if (match.margin == null) return null;
  return match.maroonPts > match.whitePts ? match.margin : -match.margin;
}

/**
 * Reconstructs a match's hole-by-hole running status from the tournament's
 * individual player scorecards. Returns null whenever the reconstruction
 * can't be trusted — an Alt Shot match, a match that hasn't finished yet,
 * missing scorecard data, or (as a final safety net) a computed result
 * that doesn't reconcile with the match's own recorded margin. That last
 * check matters most for the live tournament, whose feed-sourced
 * scorecards haven't been verified to follow the same round-numbering
 * convention as the static data above.
 */
export function getMatchHoleByHole(tournament: Tournament, match: RealMatch): MatchHoleByHole | null {
  if (!SUPPORTED_FORMATS.has(match.format)) return null;
  if ((match.status ?? "final") !== "final") return null;

  const round = deriveRoundBySession(tournament).get(`${match.day}-${match.session}`);
  if (round == null) return null;

  const maroon = teamHoleScores(tournament, match.maroonPlayers, round);
  const white = teamHoleScores(tournament, match.whitePlayers, round);
  const playerHoles = individualHoleScores(tournament, [...match.maroonPlayers, ...match.whitePlayers], round);
  if (!maroon || !white || !playerHoles || maroon.scores.length !== white.scores.length) return null;

  const holesPlayed = 18 - (match.holesRemaining ?? 0);
  if (holesPlayed < 1 || holesPlayed > maroon.scores.length) return null;

  const allHoles = maroon.scores.map((maroonScore, i) => ({
    hole: i + 1,
    par: maroon.pars[i],
    maroonScore,
    whiteScore: white.scores[i],
  }));
  const holes: MatchHoleStatus[] = [];
  let tally = 0;
  for (let i = 0; i < holesPlayed; i++) {
    const maroonScore = maroon.scores[i];
    const whiteScore = white.scores[i];
    if (maroonScore < whiteScore) tally += 1;
    else if (whiteScore < maroonScore) tally -= 1;

    const leader: Team | null = tally === 0 ? null : tally > 0 ? "maroon" : "white";
    const label = tally === 0 ? "AS" : `${Math.abs(tally)} UP`;
    holes.push({ hole: i + 1, par: maroon.pars[i], maroonScore, whiteScore, tally, label, leader });
  }

  const expected = expectedFinalTally(match);
  if (expected == null || holes[holes.length - 1].tally !== expected) return null;

  return {
    maroonPlayers: match.maroonPlayers,
    whitePlayers: match.whitePlayers,
    playerHoles,
    allHoles,
    holes,
  };
}
