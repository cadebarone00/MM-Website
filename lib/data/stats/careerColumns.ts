import type { PlayerYearStats, PuttSplit } from "./types";

/**
 * Every per-player stat we track, in display order. Shared by the website's
 * player stats page (components/stats/PlayerCareerPage.tsx) and the My
 * Profile Stats tab, so both always show the same numbers.
 */
export interface CareerStatColumn {
  label: string;
  /** One year's value, or null when it wasn't recorded. */
  value: (s: PlayerYearStats) => string | null;
  /** Counts add up across years; averages and percentages don't, so they have no total. */
  total?: (years: PlayerYearStats[]) => string | null;
}

export const fmtNum = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
export const fmtPct = (v: number) => `${v}%`;
export const fmtMoney = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Sum of the years that recorded the number, or undefined if none did. */
export function sumIfAny(values: (number | undefined)[]): number | undefined {
  const present = values.filter((v): v is number => v != null);
  return present.length > 0 ? present.reduce((a, b) => a + b, 0) : undefined;
}

const num = (pick: (s: PlayerYearStats) => number | undefined) => (s: PlayerYearStats) => {
  const v = pick(s);
  return v != null ? fmtNum(v) : null;
};
const pct = (pick: (s: PlayerYearStats) => number | undefined) => (s: PlayerYearStats) => {
  const v = pick(s);
  return v != null ? fmtPct(v) : null;
};
const sum = (pick: (s: PlayerYearStats) => number | undefined, format: (v: number) => string = String) =>
  (years: PlayerYearStats[]) => {
    const t = sumIfAny(years.map(pick));
    return t != null ? format(t) : null;
  };
/** "12 (25%)": a count with its rate. */
const countWithPct = (split: PuttSplit | undefined) =>
  split?.total != null ? `${split.total}${split.pct != null ? ` (${fmtPct(split.pct)})` : ""}` : null;
/** "25% (3)": a rate with its count. */
const pctWithCount = (split: PuttSplit | undefined) =>
  split?.pct != null ? `${fmtPct(split.pct)}${split.total != null ? ` (${split.total})` : ""}` : null;

export const CAREER_STAT_COLUMNS: CareerStatColumn[] = [
  { label: "Scoring Average", value: num((s) => s.scoringAverage) },
  { label: "Team Points Won", value: num((s) => s.teamPointsWon), total: sum((s) => s.teamPointsWon, fmtNum) },
  { label: "Total Earned", value: (s) => (s.totalEarned != null ? fmtMoney(s.totalEarned) : null), total: sum((s) => s.totalEarned, fmtMoney) },
  { label: "Total Skins", value: (s) => (s.totalSkins != null ? String(s.totalSkins) : null), total: sum((s) => s.totalSkins) },
  { label: "Putting Average", value: num((s) => s.puttingAverage) },
  { label: "Avg. Putts / Hole", value: num((s) => s.avgPuttsPerHole) },
  { label: "Par 3 Avg.", value: num((s) => s.par3Avg) },
  { label: "Par 4 Avg.", value: num((s) => s.par4Avg) },
  { label: "Par 5 Avg.", value: num((s) => s.par5Avg) },
  { label: "GIR %", value: pct((s) => s.girPct) },
  { label: "FIR %", value: pct((s) => s.firPct) },
  { label: "Total 1-Putts", value: (s) => countWithPct(s.oneJacks), total: sum((s) => s.oneJacks?.total) },
  {
    label: "Total 3+ Putts",
    value: (s) => countWithPct(s.threePlusPutts) ?? (s.threePlusPutts?.pct != null ? fmtPct(s.threePlusPutts.pct) : null),
    total: sum((s) => s.threePlusPutts?.total),
  },
  { label: "Up & Down %", value: (s) => pctWithCount(s.upAndDown) },
  { label: "Total Birdie-or-Better", value: (s) => (s.birdieOrBetter != null ? String(s.birdieOrBetter) : null), total: sum((s) => s.birdieOrBetter) },
  { label: "Total Double-or-Worse", value: (s) => (s.doubleOrWorse != null ? String(s.doubleOrWorse) : null), total: sum((s) => s.doubleOrWorse) },
  { label: "Bounce Back %", value: (s) => pctWithCount(s.bounceBack) },
  { label: "Fall Off %", value: (s) => pctWithCount(s.fallOff) },
  { label: "Strokes Gained: Total", value: num((s) => s.strokesGained?.total) },
  { label: "Strokes Gained: Off Tee", value: num((s) => s.strokesGained?.offTee) },
  { label: "Strokes Gained: Approach", value: num((s) => s.strokesGained?.approach) },
  { label: "Strokes Gained: Around Green", value: num((s) => s.strokesGained?.aroundGreen) },
  { label: "Strokes Gained: Putting", value: num((s) => s.strokesGained?.putting) },
];
