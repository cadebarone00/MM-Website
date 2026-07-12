import { players2024 } from "./players-2024";
import { players2025 } from "./players-2025";
import { players2026 } from "./players-2026";
import { courses2024 } from "./courses-2024";
import { courses2025 } from "./courses-2025";
import { courses2026 } from "./courses-2026";
import { STATS_YEARS } from "./types";
import type { CourseYearStats, PlayerYearStats, StatsYear } from "./types";

export type { StatsYear, PlayerYearStats, CourseYearStats } from "./types";
export { STATS_YEARS } from "./types";

const playersByYear: Record<StatsYear, Record<string, PlayerYearStats>> = {
  2024: players2024,
  2025: players2025,
  2026: players2026,
};

const coursesByYear: Record<StatsYear, CourseYearStats> = {
  2024: courses2024,
  2025: courses2025,
  2026: courses2026,
};

function lookupPlayer(table: Record<string, PlayerYearStats>, player: string): PlayerYearStats | null {
  const key = Object.keys(table).find((k) => k.toLowerCase() === player.toLowerCase());
  return key ? table[key] : null;
}

export function getPlayerStatsByYear(player: string): { year: StatsYear; stats: PlayerYearStats | null }[] {
  return STATS_YEARS.map((year) => ({ year, stats: lookupPlayer(playersByYear[year], player) }));
}

export function playerHasAnyStats(player: string): boolean {
  return STATS_YEARS.some((year) => lookupPlayer(playersByYear[year], player) != null);
}

export function getCourseStatsForYear(year: StatsYear): CourseYearStats | null {
  return coursesByYear[year] ?? null;
}
