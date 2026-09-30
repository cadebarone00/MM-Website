import type { Match, ScheduleDay, Session, TournamentSiteData } from "@/components/platform/tournament-site/types";
import type { TournamentActivityFeed, TournamentActivityItem } from "./activity.ts";

/**
 * What every /play screen renders. Built for real by loadTournamentHome
 * (tournamentHomeServer.ts) and, for local design review only, by the dev
 * demo (playDemo.ts). The screens render whatever is present: empty match
 * or standings lists show the pre-live-scoring holding states.
 */
export interface TournamentHome {
  slug: string;
  year: number;
  site: TournamentSiteData;
  /** The organizer's own colors (valid hex), or null when not set, so the app can fall back to The Maroon's palette. */
  colors: { primary: string | null; accent: string | null };
  /** null when the activity feed is unavailable; the home page then hides those sections. */
  feed: TournamentActivityFeed | null;
  /** Where the bottom tabs point (no trailing slash). */
  basePath: string;
  /** Where Post Announcement sends; null = posting is switched off (the demo). */
  announcementsUrl: string | null;
  links: {
    /** The public tournament website, if there is one. */
    website: string | null;
    /** Tournament Studio, only for viewers the backend lets manage the tournament. */
    commissioner: string | null;
    allTournaments: string;
  };
  /** The viewer's own match, once live scoring posts pairings; null before that. */
  yourMatch: { matchId: string; playerId: string } | null;
  /** Which schedule session (round) each match belongs to, by match id; empty before pairings exist. */
  matchSessions: Record<string, string>;
  /** True only for the local dev demo; the shell then labels the data as fixture data. */
  demo: boolean;
}

/** Tab link for a screen, under the home's base path. */
export function tabPath(basePath: string, tab: PlayTab): string {
  return tab === "home" ? basePath : `${basePath}/${tab}`;
}

/** The viewer's match and which side they are on, or null when there is none to show. */
export function findYourMatch(home: Pick<TournamentHome, "site" | "yourMatch" | "matchSessions">): { match: Match; mine: Match["sideA"]; theirs: Match["sideB"]; session: Session | null } | null {
  if (!home.yourMatch) return null;
  const match = home.site.matches.find((m) => m.id === home.yourMatch?.matchId);
  if (!match) return null;
  const onA = match.sideA.players.includes(home.yourMatch.playerId);
  if (!onA && !match.sideB.players.includes(home.yourMatch.playerId)) return null;
  return { match, mine: onA ? match.sideA : match.sideB, theirs: onA ? match.sideB : match.sideA, session: sessionFor(home, match.id) };
}

/** The schedule session a match belongs to, if known. */
export function sessionFor(home: Pick<TournamentHome, "site" | "matchSessions">, matchId: string): Session | null {
  const id = home.matchSessions[matchId];
  return id ? home.site.days.flatMap((d) => d.sessions).find((s) => s.id === id) ?? null : null;
}

/** Positions with ties shown golf-style: 1, T2, T2, 4. */
export function positionLabel(position: number, all: number[]): string {
  return all.filter((p) => p === position).length > 1 ? `T${position}` : String(position);
}

/** "-3" under par, "E" even, "+2" over: for styling a leaderboard score. */
export function parTone(score: string): "under" | "even" | "over" {
  const s = score.trim();
  return s.startsWith("-") ? "under" : s === "E" || s === "0" ? "even" : "over";
}

/**
 * Tournament Home (/play/<tournament>/<year>): the logged-in league
 * experience for players and commissioners. The public website stays at
 * /t/<tournament>/<year>. Pure helpers only; data comes from the public-site
 * projection (toSiteData) and the activity feed. Nothing here decides who
 * may see what — the database already did.
 */
export const PLAY_TABS = ["home", "matches", "leaderboard", "players", "more"] as const;
export type PlayTab = (typeof PLAY_TABS)[number];
export const PLAY_TAB_LABELS: Record<PlayTab, string> = { home: "Home", matches: "Matches", leaderboard: "Leaderboard", players: "Players", more: "More" };

export function playPath(slug: string, year: number, tab: PlayTab = "home"): string {
  const base = `/play/${encodeURIComponent(slug)}/${year}`;
  return tab === "home" ? base : `${base}/${tab}`;
}

/** Holding copy for data that only exists once live scoring (C4) opens. */
export const PAIRINGS_HOLDING = "Pairings have not been posted yet.";
export const SCORING_HOLDING = "Scores appear once live scoring opens.";

/** Today's date (YYYY-MM-DD) in the tournament's timezone. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export type NextSession =
  | { state: "upcoming"; day: ScheduleDay; session: Session }
  | { state: "complete" }
  | { state: "none" };

/**
 * The round the viewer should look at next: the first one dated today or
 * later, else the first undated one. If every dated round is in the past
 * and none is undated, play is complete. No rounds at all → none.
 */
export function nextSession(days: ScheduleDay[], today: string): NextSession {
  const dated = days.filter((day) => day.date !== "tbd" && day.sessions.length);
  const upcoming = dated.find((day) => day.date >= today) ?? days.find((day) => day.date === "tbd" && day.sessions.length);
  if (upcoming) return { state: "upcoming", day: upcoming, session: upcoming.sessions[0] };
  return dated.length ? { state: "complete" } : { state: "none" };
}

/** Announcements go in their own panel; everything else is the activity feed. Order is kept (newest first). */
export function splitFeed(feed: TournamentActivityFeed): { announcements: TournamentActivityItem[]; events: TournamentActivityItem[] } {
  return {
    announcements: feed.activity.filter((item) => item.type === "commissioner_announcement"),
    events: feed.activity.filter((item) => item.type !== "commissioner_announcement"),
  };
}

/** "Sep 30 · 2:05 PM" in the tournament's timezone; empty for a bad date. */
export function formatPostedAt(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  const format = (timeZone: string) => {
    const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
    const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
    return `${day} · ${time}`;
  };
  try {
    return format(timezone);
  } catch {
    return format("UTC");
  }
}
