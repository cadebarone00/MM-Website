import type { PastTournament } from "../platform/pastTournaments";
import type { Team, Tournament } from "../data/types";
import type { PlayerYearStats } from "../data/stats";
import { pastTournaments } from "../data";
import { getPlayerSlug } from "../data/players";

/**
 * My Profile page (/profile): every rule for what the page shows, kept free
 * of Supabase so it can be unit-tested. myProfileServer.ts gathers the data.
 */
export interface CareerStats {
  years: number[];
  rows: { label: string; values: (string | null)[]; careerTotal: string | null }[];
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
  /** The full career stats page, for players who have one. */
  statsHref: string | null;
  bio: string | null;
}

/** Where summarizePastEditions sends the founding tournament. */
export const LEGACY_SITE_HREF = "/website";

const filled = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

export function profileDisplayName(n: { fullName?: string | null; displayName?: string | null; username?: string | null; email?: string | null }): string {
  return filled(n.fullName) ?? filled(n.displayName) ?? filled(n.username) ?? filled(n.email?.split("@")[0]) ?? "Golfer";
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

const num = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The headline career numbers the player profile shows, year by year. */
export function careerStats(yearStats: { year: number; stats: PlayerYearStats | null }[]): CareerStats | null {
  if (!yearStats.some((y) => y.stats)) return null;
  const row = (label: string, pick: (s: PlayerYearStats) => number | undefined, format: (v: number) => string, total: boolean) => {
    const raw = yearStats.map((y) => (y.stats ? pick(y.stats) : undefined));
    const present = raw.filter((v): v is number => v != null);
    return {
      label,
      values: raw.map((v) => (v != null ? format(v) : null)),
      careerTotal: total && present.length ? format(present.reduce((a, b) => a + b, 0)) : null,
    };
  };
  return {
    years: yearStats.map((y) => y.year),
    rows: [
      row("Scoring Average", (s) => s.scoringAverage, num, false),
      row("Team Points Won", (s) => s.teamPointsWon, num, true),
      row("Total Earned", (s) => s.totalEarned, money, true),
      row("Total Skins", (s) => s.totalSkins, String, true),
    ],
  };
}
