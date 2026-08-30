// lib/live/types.ts
export type Team = "maroon" | "white";
export type MatchFormat = "Fourball" | "Foursome" | "Singles";
export type MatchState = "Scheduled" | "Armed" | "Live" | "Final";

export interface LiveHole {
  number: number;
  par: number;
  yards: number;
}

export interface LiveCourse {
  id: string;
  name: string;
  holes: LiveHole[];
}

export interface LiveHoleScore {
  player: string; // player_slug
  round: number;
  hole: number;
  score: number | null;
  putts: number | null;
  fir: boolean | null;
  gir: boolean | null;
  hostEdited: boolean;
}

export interface LiveMatchBox {
  id: string | null;
  round: number;
  boxNumber: number;
  format: MatchFormat;
  teeTime: Date;
  maroonPlayers: string[]; // player_slug[]
  whitePlayers: string[]; // player_slug[]
  state: MatchState;
  started: boolean;
}

export interface TournamentSettings {
  roundCount: number | null;
  completedAt: string | null; // ISO timestamp, null until the tournament is done
}

export interface RosterEntry {
  playerSlug: string;
  team: Team;
}

export interface LiveRoundState {
  round: number;
  started: boolean;
  courseId: string | null;
  date: string | null; // ISO date (YYYY-MM-DD)
  format: MatchFormat | null;
  courseLocked: boolean;
  matchupsLocked: boolean;
}

/**
 * The in-memory shape scoring.ts/orchestration.ts operate on — mirrors
 * Python's Tournament dataclass, trimmed to what this phase needs. Building
 * one of these from real Supabase rows is a later phase's job (this phase
 * only proves the rules that operate on it are correct).
 */
export interface LiveTournamentSnapshot {
  players: Record<string, { team: Team }>; // keyed by player_slug
  courses: Record<string, LiveCourse>; // keyed by course id
  roundCourses: Record<number, string>; // round -> course id
  scores: Map<string, LiveHoleScore>; // keyed by `${player}:${round}:${hole}`
  matchBoxes: LiveMatchBox[];
}

export function scoreKey(player: string, round: number, hole: number): string {
  return `${player}:${round}:${hole}`;
}

export function scoreFor(snapshot: LiveTournamentSnapshot, player: string, round: number, hole: number): LiveHoleScore {
  const key = scoreKey(player, round, hole);
  const existing = snapshot.scores.get(key);
  if (existing) return existing;
  const blank: LiveHoleScore = { player, round, hole, score: null, putts: null, fir: null, gir: null, hostEdited: false };
  snapshot.scores.set(key, blank);
  return blank;
}

export function readScore(snapshot: LiveTournamentSnapshot, player: string, round: number, hole: number): LiveHoleScore {
  const key = scoreKey(player, round, hole);
  return (
    snapshot.scores.get(key) ?? { player, round, hole, score: null, putts: null, fir: null, gir: null, hostEdited: false }
  );
}

export function courseForRound(snapshot: LiveTournamentSnapshot, round: number): LiveCourse | null {
  const courseId = snapshot.roundCourses[round];
  if (courseId && snapshot.courses[courseId]) return snapshot.courses[courseId];
  const first = Object.values(snapshot.courses)[0];
  return first ?? null;
}
