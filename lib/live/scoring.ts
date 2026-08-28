import { courseForRound, scoreFor, type LiveHoleScore, type LiveTournamentSnapshot, type Team } from "./types.ts";

export interface PlayerSummary {
  player: string;
  team: Team;
  gross: number;
  par: number;
  toPar: number;
  played: number;
  putts: number;
  firHit: number;
  firTotal: number;
  girHit: number;
  girTotal: number;
  birdieOrBetter: number;
  doubleOrWorse: number;
}

function holeByNumber(holes: { number: number; par: number; yards: number }[]): Map<number, { number: number; par: number; yards: number }> {
  return new Map(holes.map((hole) => [hole.number, hole]));
}

export function normalizeBool(value: boolean | number | string | null | undefined): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const text = String(value).trim().toLowerCase();
  if (text === "x" || text === "na" || text === "n/a") return null;
  return text === "1" || text === "true" || text === "yes" || text === "y";
}

export function updateScore(
  snapshot: LiveTournamentSnapshot,
  player: string,
  round: number,
  hole: number,
  score: number,
  putts: number,
  fir: boolean | number | string | null | undefined,
  gir: boolean | number | string | null | undefined
): LiveHoleScore {
  const course = courseForRound(snapshot, round);
  const holeInfo = course ? holeByNumber(course.holes).get(hole) : undefined;
  const entry = scoreFor(snapshot, player, round, hole);
  entry.score = score;
  entry.putts = putts;
  entry.fir = holeInfo?.par === 3 ? null : normalizeBool(fir);
  entry.gir = normalizeBool(gir) ?? false;
  return entry;
}

export function playerRoundScores(snapshot: LiveTournamentSnapshot, player: string, round: number): LiveHoleScore[] {
  const course = courseForRound(snapshot, round);
  if (!course) return [];
  return course.holes.map((hole) => scoreFor(snapshot, player, round, hole.number));
}

export function summarizePlayer(snapshot: LiveTournamentSnapshot, player: string, rounds?: number[]): PlayerSummary {
  const playerInfo = snapshot.players[player];
  if (!playerInfo) throw new Error(`Unknown player: ${player}`);

  const roundFilter = rounds ? new Set(rounds) : null;
  const played: LiveHoleScore[] = [];
  for (const score of snapshot.scores.values()) {
    if (score.player !== player) continue;
    if (score.score === null || score.score <= 0) continue;
    if (roundFilter && !roundFilter.has(score.round)) continue;
    played.push(score);
  }

  const parFor = (score: LiveHoleScore): number => {
    const course = courseForRound(snapshot, score.round);
    const holeInfo = course ? holeByNumber(course.holes).get(score.hole) : undefined;
    return holeInfo?.par ?? 0;
  };

  const gross = played.reduce((sum, score) => sum + (score.score ?? 0), 0);
  const par = played.reduce((sum, score) => sum + parFor(score), 0);
  const putts = played.reduce((sum, score) => sum + (score.putts ?? 0), 0);
  const firScores = played.filter((score) => parFor(score) !== 3);
  const girScores = played;

  return {
    player,
    team: playerInfo.team,
    gross,
    par,
    toPar: gross - par,
    played: played.length,
    putts,
    firHit: firScores.filter((score) => score.fir === true).length,
    firTotal: firScores.length,
    girHit: girScores.filter((score) => score.gir === true).length,
    girTotal: girScores.length,
    birdieOrBetter: played.filter((score) => (score.score ?? 0) <= parFor(score) - 1).length,
    doubleOrWorse: played.filter((score) => (score.score ?? 0) >= parFor(score) + 2).length,
  };
}

export function leaderboard(snapshot: LiveTournamentSnapshot, rounds?: number[]): PlayerSummary[] {
  const summaries = Object.keys(snapshot.players).map((player) => summarizePlayer(snapshot, player, rounds));
  return summaries.sort((a, b) => a.toPar - b.toPar || b.played - a.played || a.gross - b.gross || a.player.localeCompare(b.player));
}

export function teamTotals(snapshot: LiveTournamentSnapshot): Record<Team, number> {
  const totals: Record<Team, number> = { maroon: 0, white: 0 };
  for (const summary of leaderboard(snapshot)) {
    totals[summary.team] += summary.toPar;
  }
  return totals;
}
