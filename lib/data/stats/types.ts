export type StatsYear = 2024 | 2025 | 2026;

export const STATS_YEARS: StatsYear[] = [2024, 2025, 2026];

export interface PuttSplit {
  pct?: number;
  total?: number;
}

export interface StrokesGained {
  total?: number;
  offTee?: number;
  approach?: number;
  aroundGreen?: number;
  putting?: number;
}

export interface PlayerYearStats {
  scoringAverage?: number;
  teamPointsWon?: number;
  totalEarned?: number;
  totalSkins?: number;
  puttingAverage?: number;
  avgPuttsPerHole?: number;
  par3Avg?: number;
  par4Avg?: number;
  par5Avg?: number;
  girPct?: number;
  firPct?: number;
  oneJacks?: PuttSplit;
  threePlusPutts?: PuttSplit;
  upAndDown?: PuttSplit;
  birdieOrBetter?: number;
  doubleOrWorse?: number;
  bounceBack?: PuttSplit;
  fallOff?: PuttSplit;
  strokesGained?: StrokesGained;
}

export type PlayerYearStatsTable = Record<string, PlayerYearStats>;

export interface HoleDifficultyEntry {
  rank: number;
  hole: string;
  scoreDiff: number;
}

export interface GreenOrFairwayEntry {
  rank: number;
  hole: string;
  pct: number;
}

export interface PuttCountEntry {
  rank: number;
  hole: string;
  total: number;
}

export interface ParBucketCallout {
  hardest?: { hole: string; diff: number };
  easiest?: { hole: string; diff: number };
  worstPerformer?: string;
}

export interface CourseYearStats {
  holeDifficulty?: HoleDifficultyEntry[];
  par3?: ParBucketCallout;
  par4?: ParBucketCallout;
  par5?: ParBucketCallout;
  greenDifficulty?: GreenOrFairwayEntry[];
  fairwayDifficulty?: GreenOrFairwayEntry[];
  most3Putted?: PuttCountEntry[];
  most1Putted?: PuttCountEntry[];
}
