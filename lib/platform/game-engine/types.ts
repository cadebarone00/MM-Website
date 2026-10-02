import type { ScoringGameId, ScoringSettings } from "./scoringConfig";
import type { GameScope } from "../golfTripGames";

export interface GameSetup {
  id: ScoringGameId;
  scoring?: ScoringSettings;
  scope: GameScope;
  participants: string[];
  handicap: boolean;
  rounds: { id: string; holes: number }[];
  teams?: [string[], string[]];
  rotation?: string[];
  loneWolfMultiplier?: number;
  tiePolicy?: "tied";
}
export interface HoleInput {
  roundId: string;
  hole: number;
  scores: Record<string, { gross: number; net?: number }>;
  par?: number;
  wolfChoice?: { kind: "blind" } | { kind: "lone" } | { kind: "partner"; partner: string };
  flips?: Record<string, "heads" | "tails">;
}
export interface HoleResult {
  roundId: string;
  hole: number;
  status: "scored" | "halved" | "no-split";
  points: Record<string, number>;
  sides?: [string[], string[]];
  sideScores?: [number, number];
  winner?: 0 | 1;
  wolf?: string;
  segment?: number;
}
export interface MatchResult {
  status: "in-progress" | "complete";
  lead: number;
  state: string;
  winner?: 0 | 1;
  holesRemaining: number;
}
export interface GameResult {
  status: "ready" | "in-progress" | "complete";
  totals: Record<string, number>;
  leaders: string[];
  label: string;
  holes: HoleResult[];
  matches: (MatchResult & { roundId: string; segment?: number })[];
}
export type Scorer = (setup: GameSetup, input: HoleInput, scores: Record<string, number>) => HoleResult;

export function bestBall(sides: [string[], string[]], scores: Record<string, number>): [number, number] {
  return sides.map(side => Math.min(...side.map(id => scores[id]))) as [number, number];
}
export function contest(input: HoleInput, sides: [string[], string[]], sideScores: [number, number]): HoleResult {
  const winner = sideScores[0] === sideScores[1] ? undefined : sideScores[0] < sideScores[1] ? 0 : 1;
  return { roundId: input.roundId, hole: input.hole, status: winner === undefined ? "halved" : "scored", points: {}, sides, sideScores, winner };
}
export function fixedTeams(setup: GameSetup): [string[], string[]] {
  return setup.teams ?? [setup.participants.slice(0, setup.participants.length / 2), setup.participants.slice(setup.participants.length / 2)];
}
