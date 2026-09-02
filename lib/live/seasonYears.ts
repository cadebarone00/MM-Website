export const SEASON_YEARS: number[] = [2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034];

export function isValidSeasonYear(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && SEASON_YEARS.includes(value);
}
