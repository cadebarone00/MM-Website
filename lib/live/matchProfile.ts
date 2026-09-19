import type { RealMatch } from "@/lib/data/types";
import type { LiveOddsSnapshot } from "@/lib/wagers/liveMatchMarket";
import type { LiveTournamentSnapshot } from "./types";

export type MatchOddsPoint = LiveOddsSnapshot & { state_thru: number; created_at: string };
export type MatchProfileEntry = {
  match: { id: string; season_year: number; round: number; format: string; maroon_players: string[]; white_players: string[] };
  officialState: { status: string; thru: number; leader: "maroon" | "white" | "tie"; margin: number } | null;
  odds: MatchOddsPoint | null;
  oddsHistory: MatchOddsPoint[];
  scorecard: MatchProfileScorecard | null;
};
export type MatchProfileScorecard = {
  holes: { number: number; par: number; scores: Record<string, number | null> }[];
};

/** Call only with a confirmed-only snapshot; expose this match's strokes, never other players' statistics. */
export function matchProfileScorecard(snapshot: LiveTournamentSnapshot, id: string): MatchProfileScorecard | null {
  const box = snapshot.matchBoxes.find((match) => match.id === id);
  if (!box) return null;
  const course = snapshot.courses[snapshot.roundCourses[box.round]];
  if (!course) return null;
  return { holes: [...course.holes].sort((a, b) => a.number - b.number).map((hole) => ({
    number: hole.number,
    par: hole.par,
    scores: Object.fromEntries([...box.maroonPlayers, ...box.whitePlayers].map((player) => {
      const score = snapshot.scores.get(`${player}:${box.round}:${hole.number}`)?.score;
      return [player, score != null && score > 0 ? score : null];
    })),
  })) };
}

export function profileMatch({ match, officialState: state, odds }: MatchProfileEntry): RealMatch {
  const final = state?.status === "complete" || state?.status === "closed_out";
  return {
    id: match.id, day: match.round, session: "Morning", format: match.format,
    maroonPlayers: match.maroon_players, whitePlayers: match.white_players,
    maroonPts: final ? state.leader === "maroon" ? 1 : state.leader === "tie" ? 0.5 : 0 : 0,
    whitePts: final ? state.leader === "white" ? 1 : state.leader === "tie" ? 0.5 : 0 : 0,
    status: final ? "final" : state?.status === "live" ? "live" : "scheduled",
    thru: state?.thru, leader: state?.leader, margin: state?.margin,
    holesRemaining: 18 - (state?.thru ?? 0),
    maroonWinProbability: odds?.maroon_win_probability, whiteWinProbability: odds?.white_win_probability, tieProbability: odds?.tie_probability,
  };
}
