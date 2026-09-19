import type { CareerHoleRecord, CareerTeamHoleRecord } from "@/lib/data/careerStats";
import type { RealMatch, Tournament } from "@/lib/data/types";
import type { MatchOddsPoint } from "@/lib/live/matchProfile";
import { tournamentRoundSequence } from "@/lib/data/tournamentRoundSequence";

type Distribution = Map<number, number>;
type Outcome = { a: number; tie: number; b: number };
export type HistoricalMatchOdds = { points: MatchOddsPoint[]; note: string };
const formatName = (format: string) => format === "Alt Shot" || format === "Foursome" ? "Alternate Shot" : format;
const price = (p: number) => p <= 0 || p >= 1 ? null : p >= 0.5 ? -Math.round(100 * p / (1 - p)) : Math.round(100 * (1 - p) / p);
const point = (thru: number, odds: Outcome): MatchOddsPoint => ({ state_thru: thru, created_at: "", maroon_win_probability: odds.a, tie_probability: odds.tie, white_win_probability: odds.b, maroon_american_odds: price(odds.a), tie_american_odds: price(odds.tie), white_american_odds: price(odds.b) });

function distribution(rows: { par: number; score: number }[], par: number): Distribution {
  const samePar = rows.filter((row) => row.par === par);
  const pool = samePar.length ? samePar : rows;
  const result: Distribution = new Map();
  for (const row of pool) {
    const score = Math.max(1, par + row.score - row.par);
    result.set(score, (result.get(score) ?? 0) + 1 / pool.length);
  }
  return result;
}

function combine(a: Distribution, b: Distribution, bestBall: boolean): Distribution {
  const result: Distribution = new Map();
  for (const [left, lp] of a) for (const [right, rp] of b) {
    const score = bestBall ? Math.min(left, right) : Math.round((left + right) / 2);
    result.set(score, (result.get(score) ?? 0) + lp * rp);
  }
  return result;
}

/** Exact propagation of empirical hole outcomes; no random reroll on page refresh. */
export function remainingMatchOdds(outcomes: Outcome[], lead: number): Outcome {
  let leads: Distribution = new Map([[lead, 1]]);
  for (const hole of outcomes) {
    const next: Distribution = new Map();
    for (const [margin, probability] of leads) {
      for (const [delta, chance] of [[1, hole.a], [0, hole.tie], [-1, hole.b]]) next.set(margin + delta, (next.get(margin + delta) ?? 0) + probability * chance);
    }
    leads = next;
  }
  const odds = { a: 0, tie: 0, b: 0 };
  for (const [margin, probability] of leads) odds[margin > 0 ? "a" : margin < 0 ? "b" : "tie"] += probability;
  return odds;
}

/** Replay 2026 using prior-year training only. Current-year scores reveal progress, never player strength. */
export function reconstructHistoricalMatchOdds(tournament: Tournament, match: RealMatch, records: CareerHoleRecord[], teamRecords: CareerTeamHoleRecord[]): HistoricalMatchOdds {
  if (tournament.year !== 2026) return { points: [], note: "" };
  const training = records.filter((row) => (row.year === 2024 || row.year === 2025) && row.score > 0 && row.roundHoles !== 9 && (row.format === "Singles" || row.format === "Fourball"));
  const teamTraining = teamRecords.filter((row) => (row.year === 2024 || row.year === 2025) && row.score > 0 && formatName(row.format) === "Alternate Shot");
  if (!training.length) return { points: [], note: "Not enough 2024–2025 scores to estimate this match." };
  const format = formatName(match.format);
  const shared = format === "Alternate Shot";
  // The archive's round numbers include shared-ball rounds; align by format occurrence,
  // including the 2026 day-three sessions whose schedule and stroke archive order differ.
  const sessions = tournamentRoundSequence(tournament).filter((row) => formatName(row.format) === format);
  const occurrence = sessions.findIndex((row) => row.day === match.day && row.session === match.session);
  const current = (shared ? teamRecords : records).filter((row) => row.year === 2026 && formatName(row.format) === format);
  const round = [...new Set(current.map((row) => row.round))].sort((a, b) => a - b)[occurrence];
  const individualRound = records.filter((row) => row.year === 2026 && row.round === round && formatName(row.format) === format);
  const sharedRound = teamRecords.filter((row) => row.year === 2026 && row.round === round && formatName(row.format) === format);
  const pairMatches = (row: CareerTeamHoleRecord, players: string[]) => players.includes(row.player1) && players.includes(row.player2);
  const currentSide = (players: string[], hole: number): number | null => {
    if (shared) return sharedRound.find((row) => row.hole === hole && pairMatches(row, players))?.score ?? null;
    const scores = players.map((player) => individualRound.find((row) => row.player === player && row.hole === hole)?.score);
    return scores.length && scores.every((score) => score != null && score > 0) ? Math.min(...scores as number[]) : null;
  };
  let pooled = false;
  const sideDistribution = (players: string[], par: number): Distribution => {
    if (shared) {
      const pair = teamTraining.filter((row) => pairMatches(row, players));
      const familiar = teamTraining.filter((row) => players.includes(row.player1) || players.includes(row.player2));
      const pool = pair.length >= 18 ? pair : familiar.length ? familiar : teamTraining;
      if (pool.length) return distribution(pool, par);
    }
    const pools = players.map((player) => {
      const own = training.filter((row) => row.player === player);
      if (!own.length) pooled = true;
      return distribution(own.length ? own : training, par);
    });
    return pools.slice(1).reduce((result, pool) => combine(result, pool, !shared), pools[0]);
  };
  const holes = Array.from({ length: 18 }, (_, index) => {
    const number = index + 1;
    const setup = current.find((row) => row.round === round && row.hole === number);
    const par = setup?.par ?? 4;
    const a = sideDistribution(match.maroonPlayers, par);
    const b = sideDistribution(match.whitePlayers, par);
    const outcome = { a: 0, tie: 0, b: 0 };
    for (const [as, ap] of a) for (const [bs, bp] of b) outcome[as < bs ? "a" : as > bs ? "b" : "tie"] += ap * bp;
    return { outcome, a: currentSide(match.maroonPlayers, number), b: currentSide(match.whitePlayers, number) };
  });
  const outcomes = holes.map((hole) => hole.outcome);
  const points = [point(0, remainingMatchOdds(outcomes, 0))];
  const finalThru = 18 - (match.holesRemaining ?? 0);
  let lead = 0;
  let discrepancy = false;
  let missing = false;
  for (let index = 0; index < finalThru - 1; index++) {
    const hole = holes[index];
    if (hole.a == null || hole.b == null) { missing = true; break; }
    lead += Math.sign(hole.b - hole.a);
    points.push(point(index + 1, remainingMatchOdds(outcomes.slice(index + 1), lead)));
    if (Math.abs(lead) > 18 - index - 1) { discrepancy = index + 1 !== finalThru; break; }
  }
  const last = holes[finalThru - 1];
  if (!missing && !discrepancy && last?.a != null && last.b != null) {
    const finalLead = lead + Math.sign(last.b - last.a);
    discrepancy = Math.sign(finalLead) !== Math.sign(match.maroonPts - match.whitePts) || (match.margin != null && Math.abs(finalLead) !== match.margin);
  }
  points.push(point(finalThru, { a: match.maroonPts > match.whitePts ? 1 : 0, tie: match.maroonPts === match.whitePts ? 1 : 0, b: match.whitePts > match.maroonPts ? 1 : 0 }));
  const notes = ["Estimated replay using 2024–2025 scoring patterns and recorded 2026 holes; not odds recorded live."];
  if (shared) notes.push("Alternate Shot uses prior shared-ball scores, with a broader partner sample when needed.");
  if (pooled) notes.push("Players without prior scores use the 2024–2025 field average.");
  if (missing) notes.push("Missing hole history is skipped; the final point is the published result.");
  if (discrepancy) notes.push("Archived strokes differ from the published result; the final point follows the published result.");
  return { points, note: notes.join(" ") };
}
