import type { ScheduleDay, Session } from "@/components/platform/tournament-site/types";
import type { TournamentActivityFeed, TournamentActivityItem } from "./activity.ts";

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
