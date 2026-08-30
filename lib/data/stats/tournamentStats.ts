import { holeMarker, playersOf } from "@/lib/data";
import type { PlayerScorecard, Tournament } from "@/lib/data";
import { getPlayerStatsByYear } from "@/lib/data/stats";
import type { StrokesGained } from "@/lib/data/stats/types";

/**
 * Derived, read-only stats for the "Statistics" section on a player's
 * scorecard page. Everything except Strokes Gained is computed straight
 * from `tournament.scorecards` — the same source the scorecard itself
 * reads — so it works identically for a historical and a live tournament.
 * Strokes Gained is the one category that genuinely needs the season
 * stats table (expected-strokes benchmarking isn't reconstructable from
 * hole-by-hole scores), so it can come back unavailable for a tournament
 * whose year has no table yet.
 */

function findScorecard(tournament: Tournament, player: string): PlayerScorecard | undefined {
  return tournament.scorecards?.find((s) => s.player.toLowerCase() === player.toLowerCase());
}

function otherPlayers(tournament: Tournament, excludePlayer: string): string[] {
  return playersOf(tournament)
    .map((p) => p.name)
    .filter((name) => name.toLowerCase() !== excludePlayer.toLowerCase());
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// ---- Scoring Summary ------------------------------------------------------

export interface ScoringSummary {
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  doubleOrWorse: number;
  holesPlayed: number;
}

function emptySummary(): ScoringSummary {
  return { eagle: 0, birdie: 0, par: 0, bogey: 0, doubleOrWorse: 0, holesPlayed: 0 };
}

export function getScoringSummary(tournament: Tournament, player: string): ScoringSummary {
  const card = findScorecard(tournament, player);
  const summary = emptySummary();
  if (!card) return summary;

  for (const round of card.rounds) {
    for (const hole of round.holes) {
      if (!hole.score) continue;
      summary.holesPlayed += 1;
      switch (holeMarker(hole.diff)) {
        case "eagle":
          summary.eagle += 1;
          break;
        case "birdie":
          summary.birdie += 1;
          break;
        case "par":
          summary.par += 1;
          break;
        case "bogey":
          summary.bogey += 1;
          break;
        default:
          summary.doubleOrWorse += 1;
      }
    }
  }
  return summary;
}

/** Field totals pooled across every other player (not an average-of-averages) — used for the mini per-category donuts. */
export function fieldScoringSummary(tournament: Tournament, excludePlayer: string): ScoringSummary {
  const totals = emptySummary();
  for (const name of otherPlayers(tournament, excludePlayer)) {
    const s = getScoringSummary(tournament, name);
    totals.eagle += s.eagle;
    totals.birdie += s.birdie;
    totals.par += s.par;
    totals.bogey += s.bogey;
    totals.doubleOrWorse += s.doubleOrWorse;
    totals.holesPlayed += s.holesPlayed;
  }
  return totals;
}

export function summaryPct(summary: ScoringSummary, key: keyof Omit<ScoringSummary, "holesPlayed">): number | null {
  return summary.holesPlayed > 0 ? (summary[key] / summary.holesPlayed) * 100 : null;
}

// ---- Fairways / GIR / 3-Putt Avoidance / Up-and-Down (all %) -------------

export type PctKind = "fir" | "gir" | "threePutt" | "upDown";

export interface PerRoundPct {
  round: number;
  course: string;
  pct: number;
}

export interface PctSeries {
  overallPct: number | null;
  perRound: PerRoundPct[];
}

export function getPctSeries(tournament: Tournament, player: string, kind: PctKind): PctSeries {
  const card = findScorecard(tournament, player);
  if (!card) return { overallPct: null, perRound: [] };

  let hitTotal = 0;
  let attemptTotal = 0;
  const perRound: PerRoundPct[] = [];

  for (const round of card.rounds) {
    let hit = 0;
    let attempts = 0;
    if (kind === "fir") {
      hit = round.firHit;
      attempts = round.firTotal;
    } else if (kind === "gir") {
      hit = round.girHit;
      attempts = round.girTotal;
    } else if (kind === "threePutt") {
      for (const h of round.holes) {
        if (!h.score) continue;
        attempts += 1;
        if (h.putts < 3) hit += 1;
      }
    } else {
      for (const h of round.holes) {
        if (!h.score || h.gir === 1) continue; // up-and-down only applies when GIR was missed
        attempts += 1;
        if (h.score <= h.par) hit += 1;
      }
    }
    if (attempts > 0) {
      perRound.push({ round: round.round, course: round.course, pct: (hit / attempts) * 100 });
      hitTotal += hit;
      attemptTotal += attempts;
    }
  }

  return { overallPct: attemptTotal > 0 ? (hitTotal / attemptTotal) * 100 : null, perRound };
}

export function fieldPctSeries(tournament: Tournament, excludePlayer: string, kind: PctKind): PctSeries {
  const others = otherPlayers(tournament, excludePlayer);
  const overall = average(
    others.map((name) => getPctSeries(tournament, name, kind).overallPct).filter((v): v is number => v != null)
  );

  const byRound = new Map<number, number[]>();
  for (const name of others) {
    for (const { round, pct } of getPctSeries(tournament, name, kind).perRound) {
      const arr = byRound.get(round) ?? [];
      arr.push(pct);
      byRound.set(round, arr);
    }
  }
  const perRound = [...byRound.entries()]
    .map(([round, vals]) => ({ round, pct: average(vals) ?? 0 }))
    .sort((a, b) => a.round - b.round);

  return { overallPct: overall, perRound };
}

// ---- Putts / Round --------------------------------------------------------

export interface PuttsRoundEntry {
  round: number;
  course: string;
  puttsPerHole: number;
  threePutts: number;
}

export function getPuttsPerRound(tournament: Tournament, player: string): PuttsRoundEntry[] {
  const card = findScorecard(tournament, player);
  if (!card) return [];
  return card.rounds.map((round) => {
    const played = round.holes.filter((h) => h.score > 0);
    return {
      round: round.round,
      course: round.course,
      puttsPerHole: played.length > 0 ? round.putts / played.length : 0,
      threePutts: played.filter((h) => h.putts >= 3).length,
    };
  });
}

export function fieldPuttsPerRound(tournament: Tournament, excludePlayer: string): { round: number; puttsPerHole: number }[] {
  const byRound = new Map<number, number[]>();
  for (const name of otherPlayers(tournament, excludePlayer)) {
    for (const { round, puttsPerHole } of getPuttsPerRound(tournament, name)) {
      const arr = byRound.get(round) ?? [];
      arr.push(puttsPerHole);
      byRound.set(round, arr);
    }
  }
  return [...byRound.entries()].map(([round, vals]) => ({ round, puttsPerHole: average(vals) ?? 0 })).sort((a, b) => a.round - b.round);
}

// ---- Strokes Gained (season table — not derivable from hole scores) ------

export function getStrokesGained(year: number, player: string): StrokesGained | null {
  return getPlayerStatsByYear(player).find((y) => y.year === year)?.stats?.strokesGained ?? null;
}

export function fieldStrokesGained(year: number, tournament: Tournament, excludePlayer: string): StrokesGained | null {
  const entries = otherPlayers(tournament, excludePlayer)
    .map((name) => getStrokesGained(year, name))
    .filter((v): v is StrokesGained => v != null);
  if (entries.length === 0) return null;

  const avgKey = (key: keyof StrokesGained) => average(entries.map((e) => e[key]).filter((v): v is number => v != null)) ?? undefined;
  return {
    total: avgKey("total"),
    offTee: avgKey("offTee"),
    approach: avgKey("approach"),
    aroundGreen: avgKey("aroundGreen"),
    putting: avgKey("putting"),
  };
}
