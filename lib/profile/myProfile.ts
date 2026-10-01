import type { PastTournament } from "../platform/pastTournaments";
import type { Team, Tournament } from "../data/types";
import type { PlayerYearStats } from "../data/stats";
import { CAREER_STAT_COLUMNS } from "../data/stats/careerColumns";
import { pastTournaments } from "../data";
import { getPlayerSlug } from "../data/players";

/**
 * My Profile page (/profile): every rule for what the page shows, kept free
 * of Supabase so it can be unit-tested. myProfileServer.ts gathers the data.
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

export interface MyProfile {
  name: string;
  initials: string;
  avatarSrc: string | null;
  memberSince: string | null;
  /** Players can edit their bio (admin approves); fans can't. */
  canEditBio: boolean;
  teams: Team[];
  active: PastTournament[];
  completed: PastTournament[];
  stats: CareerStats | null;
  bio: string | null;
}

/** Where summarizePastEditions sends the founding tournament. */
export const LEGACY_SITE_HREF = "/website";

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

/** The Maroon 2024–26 years this player played, from the static rosters. */
export function maroonYearsPlayed(playerSlug: string | null, tournaments: Tournament[] = pastTournaments): PastTournament[] {
  if (!playerSlug) return [];
  return tournaments
    .filter((t) => onRoster(t.roster.maroon, playerSlug) || onRoster(t.roster.white, playerSlug))
    .sort((a, b) => b.year - a.year)
    .map((t) => ({
      name: "The Maroon Tournament", year: t.year, destination: t.location || null,
      startDate: t.startDate || null, endDate: t.endDate || null, href: `/leaderboard/${t.slug}`,
    }));
}

export function teamsPlayed(playerSlug: string | null, tournaments: Tournament[] = pastTournaments): Team[] {
  if (!playerSlug) return [];
  const teams: Team[] = [];
  if (tournaments.some((t) => onRoster(t.roster.maroon, playerSlug))) teams.push("maroon");
  if (tournaments.some((t) => onRoster(t.roster.white, playerSlug))) teams.push("white");
  return teams;
}

/**
 * Finished years from both sources. A Maroon year the static rosters already
 * cover is dropped from the platform list, so it shows once (with the static
 * row's leaderboard link).
 */
export function mergeCompleted(maroonYears: PastTournament[], platformPast: PastTournament[]): PastTournament[] {
  const covered = new Set(maroonYears.map((t) => t.year));
  const rest = platformPast.filter((t) => !(t.href === LEGACY_SITE_HREF && covered.has(t.year)));
  return [...maroonYears, ...rest].sort((a, b) => b.year - a.year || (b.endDate ?? "").localeCompare(a.endDate ?? "") || a.name.localeCompare(b.name));
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
