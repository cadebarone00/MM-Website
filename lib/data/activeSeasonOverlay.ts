// lib/data/activeSeasonOverlay.ts
//
// Server-only. This file imports @/lib/supabase/server, which pulls in
// next/headers transitively — importing it from anywhere reachable by a
// Client Component breaks `npm run build`. Only import this file from a
// true Server Component (see Task 10). Never import it from
// lib/data/index.ts itself, and never re-export its functions from there
// — that would poison every Client Component that imports anything else
// from lib/data/index.ts.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { nextTournament, nextVenue, pastVenues } from "./index";
import type { UpcomingTournament, VenueSchedule, NextTournamentOverride } from "./types";

interface ActiveSeasonSettings {
  seasonYear: number;
  venueName: string | null;
  beginDate: string | null;
  endDate: string | null;
}

export interface UpcomingRoundScheduleItem {
  round: number;
  date: string | null;
  courseName: string | null;
  format: string | null;
}

async function getActiveSeasonSettings(): Promise<ActiveSeasonSettings | null> {
  const service = createSupabaseServiceRoleClient();
  const { data: active } = await service.from("live_active_season").select("season_year").eq("id", true).maybeSingle();
  if (!active) return null;
  const { data: settings } = await service
    .from("live_tournament_settings")
    .select("venue_name, begin_date, end_date")
    .eq("season_year", active.season_year)
    .maybeSingle();
  return {
    seasonYear: active.season_year,
    venueName: settings?.venue_name ?? null,
    beginDate: settings?.begin_date ?? null,
    endDate: settings?.end_date ?? null,
  };
}

// Formats an inclusive date range the same way the hand-written
// dateLabel strings in lib/data/*-upcoming.ts already read (e.g.
// "January 6–9, 2027"). Both dates are "YYYY-MM-DD".
export function formatDateLabel(begin: string, end: string): string {
  const b = new Date(`${begin}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long" });
  if (b.getFullYear() === e.getFullYear() && b.getMonth() === e.getMonth()) {
    return `${monthFmt.format(b)} ${b.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
  }
  const dayFmt = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });
  const beginStr = b.getFullYear() === e.getFullYear()
    ? `${dayFmt.format(b)}`
    : `${dayFmt.format(b)}, ${b.getFullYear()}`;
  return `${beginStr} – ${dayFmt.format(e)}, ${e.getFullYear()}`;
}

/**
 * `nextTournament`, with venue and dates overlaid from the database for
 * whichever year is currently marked active — everything else (slug,
 * roster, location, notes) stays exactly what the static per-year file
 * says, same as `nextTournament` today. Falls back to the static value
 * untouched if no active-season row/settings exist yet.
 */
export async function getNextTournament(): Promise<UpcomingTournament> {
  const override = await getActiveSeasonSettings();
  if (!override || override.seasonYear !== nextTournament.year) return nextTournament;
  return {
    ...nextTournament,
    venue: override.venueName ?? nextTournament.venue,
    startDate: override.beginDate ?? nextTournament.startDate,
    endDate: override.endDate ?? nextTournament.endDate,
    dateLabel: override.beginDate && override.endDate ? formatDateLabel(override.beginDate, override.endDate) : nextTournament.dateLabel,
  };
}

/** Same overlay, applied to `nextVenue`'s `venueName`. */
export async function getNextVenue(): Promise<VenueSchedule> {
  const override = await getActiveSeasonSettings();
  if (!override || override.seasonYear !== nextVenue.year || !override.venueName) return nextVenue;
  return { ...nextVenue, venueName: override.venueName };
}

/** Async counterpart of lib/data/index.ts's getVenueBySlug — same slug match, live-overlaid venue. */
export async function getVenueBySlugAsync(slug: string): Promise<VenueSchedule | undefined> {
  if (slug === nextTournament.slug) return getNextVenue();
  return pastVenues[slug];
}

/** Just the two fields the public-site chrome components need, for
 * threading through client component props (see Task 10). */
export async function getNextTournamentOverride(): Promise<NextTournamentOverride> {
  const t = await getNextTournament();
  return { venue: t.venue, dateLabel: t.dateLabel };
}

/**
 * The home-page schedule is a direct public read of Tiger Center's round
 * setup. Courses and formats are never duplicated in static website data:
 * changing either field in Tiger Center changes this list automatically.
 */
export async function getUpcomingRoundSchedule(): Promise<UpcomingRoundScheduleItem[]> {
  const service = createSupabaseServiceRoleClient();
  const { data: active } = await service
    .from("live_active_season")
    .select("season_year")
    .eq("id", true)
    .maybeSingle();

  if (!active) return [];

  const { data: rounds, error } = await service
    .from("live_round_state")
    .select("round, date, format, course_id")
    .eq("season_year", active.season_year)
    .order("round");

  if (error || !rounds?.length) return [];

  const courseIds = [...new Set(rounds.map((round) => round.course_id).filter((id): id is string => Boolean(id)))];
  const { data: courses } = courseIds.length
    ? await service.from("live_courses").select("id, name").in("id", courseIds)
    : { data: [] as { id: string; name: string }[] };
  const courseNames = new Map((courses ?? []).map((course) => [course.id, course.name]));

  return rounds.map((round) => ({
    round: round.round,
    date: round.date ?? null,
    courseName: round.course_id ? courseNames.get(round.course_id) ?? null : null,
    format: round.format ?? null,
  }));
}
