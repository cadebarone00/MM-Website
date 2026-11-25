import type { RoundStats } from "./roundStats.ts";

/**
 * Profile → Stats → Compare: the stats two golfers can be compared on, and the ones picked at first. Shared by the
 * website (components/profile/CompareRings.tsx) and the Expo app (mobile/).
 */
export type CompareMetric = { key: string; label: string; lowerIsBetter?: boolean; value: (s: RoundStats) => number | null };
export const COMPARE_METRICS: CompareMetric[] = [
  { key: "fairways", label: "Fairways", value: (s) => s.driving?.fairwayPct ?? null },
  { key: "gir", label: "Greens (GIR)", value: (s) => s.approach?.girPct ?? null },
  { key: "birdie", label: "Birdie or better", value: (s) => s.scoring?.birdiePct ?? null },
  { key: "parPlus", label: "Par or better", value: (s) => s.scoring?.parOrBetterPct ?? null },
  { key: "scrambling", label: "Scrambling", value: (s) => s.scrambling?.pct ?? null },
  { key: "onePutt", label: "1-putts", value: (s) => s.putting?.onePuttPct ?? null },
  { key: "threePutt", label: "3-putts", lowerIsBetter: true, value: (s) => s.putting?.threePuttPct ?? null },
  { key: "doubles", label: "Double or worse", lowerIsBetter: true, value: (s) => s.scoring?.doublePct ?? null },
];
export const COMPARE_DEFAULT = ["fairways", "gir", "birdie", "scrambling"];
