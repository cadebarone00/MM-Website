/** Shared registry: both Tiger editing surfaces and public reads use these keys. */
export const WEBSITE_SECTIONS = [
  { key: "home", label: "Home · tournament and hero", path: "/" },
  { key: "home_results", label: "Home · results strip", path: "/" },
  { key: "home_schedule", label: "Home · schedule", path: "/" },
  { key: "home_teams", label: "Home · teams", path: "/" },
  { key: "leaderboard", label: "Leaderboard", path: "/leaderboard" },
  { key: "teams", label: "Teams and player profiles", path: "/teams" },
  { key: "schedule", label: "Schedule", path: "/schedule" },
  { key: "portal", label: "Player portal · tournament and matches", path: "/portal" },
] as const;
export type WebsiteSection = typeof WEBSITE_SECTIONS[number]["key"];
export const DISPLAY_YEARS = Array.from({ length: 10 }, (_, index) => 2024 + index);
export type WebsiteYearSettings = Record<WebsiteSection, number | null>;
export function isWebsiteSection(value: unknown): value is WebsiteSection {
  return WEBSITE_SECTIONS.some(section => section.key === value);
}
export function emptyWebsiteSettings(): WebsiteYearSettings {
  return Object.fromEntries(WEBSITE_SECTIONS.map(section => [section.key, null])) as WebsiteYearSettings;
}
export function isDisplayYear(value: unknown): value is number {
  return typeof value === "number" && DISPLAY_YEARS.includes(value);
}
export function sectionForPath(path: string): WebsiteSection {
  if (/^\/portal(?:\/|$)/.test(path)) return "portal";
  if (/^\/teams(?:\/|$)/.test(path)) return "teams";
  if (/^\/schedule(?:\/|$)/.test(path)) return "schedule";
  if (/^\/(?:leaderboard|api\/live)(?:\/|$)/.test(path)) return "leaderboard";
  return "home";
}
export function parseYearChange(value: unknown): { section: WebsiteSection; year: number | null } | null {
  if (!value || typeof value !== "object") return null;
  const { section, year } = value as Record<string, unknown>;
  return isWebsiteSection(section) && (year === null || isDisplayYear(year)) ? { section, year } : null;
}
