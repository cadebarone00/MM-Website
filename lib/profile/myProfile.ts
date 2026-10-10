import type { Team, Tournament } from "../data/types";
import type { LegacyMaroonYear } from "./profileReadModel";
import type { PlayerYearStats } from "../data/stats";
import { CAREER_STAT_COLUMNS } from "../data/stats/careerColumns";
import { pastTournaments } from "../data";
import { getPlayerSlug } from "../data/players";

/**
 * My Profile page (/profile) helpers, kept free of Supabase so they can be unit-tested. The page's data is the
 * profile read model (profileReadModel.ts); myProfileServer.ts loads it for the signed-in person.
 */
export interface CareerStats {
  /** Stat labels, after the Year and Event columns. */
  columns: string[];
  rows: { year: number; event: string; values: (string | null)[] }[];
  /** Career totals per stat; null for averages and percentages. */
  totals: (string | null)[];
  /** The raw years played, for the "Performance at a glance" chart. */
  played: { year: number; stats: PlayerYearStats }[];
}

const filled = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

export function profileDisplayName(n: { fullName?: string | null; displayName?: string | null; username?: string | null; email?: string | null }): string {
  return filled(n.fullName) ?? filled(n.displayName) ?? filled(n.username) ?? filled(n.email?.split("@")[0]) ?? "Golfer";
}

/** A player's name: the saved player_slots name unless it's blank, else their hand-written profile's. */
export function playerFullName(slotName: string | null | undefined, staticName: string | null | undefined): string | null {
  return filled(slotName) ?? filled(staticName);
}

export function initialsFor(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase());
  return letters.length ? letters.join("") : "?";
}

export function memberSinceLabel(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const onRoster = (names: string[], playerSlug: string) => names.some((name) => getPlayerSlug(name) === playerSlug);

/** LEGACY: the static Maroon years (2024–26 archive) this player was rostered, with that year's team; newest first. */
export function legacyMaroonYears(playerSlug: string, tournaments: Tournament[] = pastTournaments): LegacyMaroonYear[] {
  return tournaments.flatMap((t): LegacyMaroonYear[] => {
    const team: Team | null = onRoster(t.roster.maroon, playerSlug) ? "maroon" : onRoster(t.roster.white, playerSlug) ? "white" : null;
    return team ? [{ year: t.year, team, destination: t.location || null, href: `/leaderboard/${t.slug}` }] : [];
  }).sort((a, b) => b.year - a.year);
}

/** Every stat-tracked event so far is The Maroon Tournament. */
export const STATS_EVENT = "The Maroon Tournament";

/**
 * The Stats tab table: one row per year played (oldest first, so a new
 * tournament adds a row at the bottom), a column per stat, then a total row.
 * Years the player sat out are left out.
 */
export function careerStats(yearStats: { year: number; stats: PlayerYearStats | null }[]): CareerStats | null {
  const played = yearStats
    .filter((y): y is { year: number; stats: PlayerYearStats } => y.stats != null)
    .sort((a, b) => a.year - b.year);
  if (!played.length) return null;
  return {
    columns: CAREER_STAT_COLUMNS.map((c) => c.label),
    rows: played.map((y) => ({ year: y.year, event: STATS_EVENT, values: CAREER_STAT_COLUMNS.map((c) => c.value(y.stats)) })),
    totals: CAREER_STAT_COLUMNS.map((c) => c.total?.(played.map((y) => y.stats)) ?? null),
    played,
  };
}
