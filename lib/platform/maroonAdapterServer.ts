import { pastTournaments } from "@/lib/data";
import { getVenueBySlugAsync } from "@/lib/data/activeSeasonOverlay";
import { getSeasonTournament } from "@/lib/data/seasonCatalog";
import { getPlayerNameMap } from "@/lib/portal/allPlayers";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { editionFilter, maroonEdition, MAROON_TOURNAMENT_SLUG } from "./editionScope.ts";
import { maroonPlayingEditions, maroonSiteData, type MaroonRoundRow, type MaroonSite } from "./maroonAdapter.ts";
import type { PastTournament } from "./pastTournaments.ts";

/**
 * Server-only. Gathers The Maroon Tournament's data for one year, read-only,
 * and runs it through the pure adapter (maroonAdapter.ts). Identity comes
 * from the platform rows C1 created; matches, points, standings and roster
 * come from the same readers the old site uses (Supabase for live years, the
 * history files for 2024–2026). Never the Google Sheet, never a write.
 *
 * Returns null when the year has no edition or is the test season. Throws on
 * a database error so the caller can show its error state.
 */
export async function loadMaroonSite(year: number): Promise<MaroonSite | null> {
  if (!Number.isInteger(year)) return null;
  const service = createSupabaseServiceRoleClient();

  const { data: tournament, error: tournamentError } = await service.from("tournaments")
    .select("id, name, short_name, branding").eq("slug", MAROON_TOURNAMENT_SLUG).eq("is_legacy", true).maybeSingle();
  if (tournamentError) throw new Error(`Could not read The Maroon Tournament: ${tournamentError.message}`);
  if (!tournament) return null;

  const { data: edition, error: editionError } = await service.from("tournament_editions")
    .select("id, season_year, destination, start_date, end_date, timezone, is_test")
    .eq("tournament_id", tournament.id).eq("season_year", year).maybeSingle();
  if (editionError) throw new Error(`Could not read the ${year} edition: ${editionError.message}`);
  if (!edition || edition.is_test) return null;

  const isHistory = pastTournaments.some((t) => t.year === year);
  const [teams, settings, legacy, names, rounds] = await Promise.all([
    service.from("edition_teams").select("key, name, color").eq("edition_id", edition.id).order("sort_order"),
    service.from("edition_settings").select("scoring").eq("edition_id", edition.id).maybeSingle(),
    getSeasonTournament(year),
    getPlayerNameMap(),
    isHistory ? Promise.resolve(null) : service.from("live_round_state")
      .select("round, date, format, course_id, course_locked").match(editionFilter(maroonEdition(year))).order("round"),
  ]);
  if (teams.error) throw new Error(`Could not read the ${year} teams: ${teams.error.message}`);
  if (settings.error) throw new Error(`Could not read the ${year} settings: ${settings.error.message}`);
  if (rounds?.error) throw new Error(`Could not read the ${year} rounds: ${rounds.error.message}`);

  const venue = await getVenueBySlugAsync(legacy.slug);
  const scoring = settings.data?.scoring as { pointsForWin?: unknown; pointsForHalve?: unknown } | undefined;

  const liveRounds: MaroonRoundRow[] | null = rounds === null ? null : (rounds.data ?? []).map((row) => ({
    round: row.round, date: row.date ?? null, format: row.format ?? null, courseId: row.course_id ?? null, courseLocked: row.course_locked === true,
  }));

  return maroonSiteData({
    edition: {
      name: tournament.name, shortName: tournament.short_name, branding: (tournament.branding ?? {}) as Record<string, unknown>,
      seasonYear: edition.season_year, destination: edition.destination, startDate: edition.start_date, endDate: edition.end_date,
      timezone: edition.timezone,
      scoring: typeof scoring?.pointsForWin === "number" && typeof scoring.pointsForHalve === "number"
        ? { pointsForWin: scoring.pointsForWin, pointsForHalve: scoring.pointsForHalve } : null,
      teams: teams.data ?? [],
    },
    tournament: legacy,
    names,
    courses: venue?.courses ?? [],
    liveRounds,
  });
}

/**
 * The Maroon Tournament's My Tournaments rows for one account, read live:
 * the player slot this account claimed (player_slots.claimed_by), the years
 * that player is on the Admin Center roster (live_roster), and Admin Center's
 * locked venue/dates. Not the one-time copy in edition_roster. Throws on a
 * database error.
 */
export async function loadMyMaroonEditions(profileId: string): Promise<PastTournament[]> {
  const service = createSupabaseServiceRoleClient();
  const { data: slots, error: slotError } = await service.from("player_slots").select("player_slug").eq("claimed_by", profileId);
  if (slotError) throw new Error(`Could not read your player: ${slotError.message}`);
  const slugs = (slots ?? []).map((row) => row.player_slug as string);
  if (!slugs.length) return [];

  // A multi-year read of The Maroon's own roster (C4 list: becomes edition-keyed later).
  const { data: roster, error: rosterError } = await service.from("live_roster").select("season_year").in("player_slug", slugs);
  if (rosterError) throw new Error(`Could not read the roster: ${rosterError.message}`);
  const rosterYears = [...new Set((roster ?? []).map((row) => row.season_year as number))];
  if (!rosterYears.length) return [];

  const { data: tournament, error: tournamentError } = await service.from("tournaments")
    .select("id, slug, name").eq("slug", MAROON_TOURNAMENT_SLUG).eq("is_legacy", true).maybeSingle();
  if (tournamentError) throw new Error(`Could not read The Maroon Tournament: ${tournamentError.message}`);
  if (!tournament) return [];

  const [editions, settings] = await Promise.all([
    service.from("tournament_editions").select("season_year, destination, start_date, end_date, timezone, is_test")
      .eq("tournament_id", tournament.id).in("season_year", rosterYears),
    service.from("live_tournament_settings").select("season_year, venue_name, venue_locked, begin_date, end_date, dates_locked")
      .in("season_year", rosterYears),
  ]);
  if (editions.error) throw new Error(`Could not read the editions: ${editions.error.message}`);
  if (settings.error) throw new Error(`Could not read the tournament settings: ${settings.error.message}`);

  return maroonPlayingEditions({
    slug: tournament.slug, name: tournament.name, rosterYears,
    editions: (editions.data ?? []).map((e) => ({
      seasonYear: e.season_year, destination: e.destination, startDate: e.start_date, endDate: e.end_date, timezone: e.timezone, isTest: e.is_test,
    })),
    settings: (settings.data ?? []).map((row) => ({
      seasonYear: row.season_year, venueName: row.venue_name, venueLocked: row.venue_locked === true,
      beginDate: row.begin_date, endDate: row.end_date, datesLocked: row.dates_locked === true,
    })),
  });
}
