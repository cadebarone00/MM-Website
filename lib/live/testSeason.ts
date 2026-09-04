/**
 * 2034 is reserved for end-to-end rehearsal. It deliberately uses the same
 * application workflow as a real tournament, but its archive rows are never
 * included in normal Career Stats or real-season odds calculations.
 */
export const TEST_SEASON_YEAR = 2034;
export const DEFAULT_REAL_SEASON_YEAR = 2027;

export function isTestSeason(year: number): boolean {
  return year === TEST_SEASON_YEAR;
}
