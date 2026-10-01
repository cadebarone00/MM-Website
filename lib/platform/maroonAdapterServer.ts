import { pastTournaments } from "@/lib/data";
import { getPlayerSlug } from "@/lib/data/players";
import { getVenueBySlugAsync } from "@/lib/data/activeSeasonOverlay";
import { getSeasonTournament } from "@/lib/data/seasonCatalog";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { getPlayerNameMap } from "@/lib/portal/allPlayers";
import { requireHost } from "@/lib/portal/requireHost";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { editionFilter, maroonEdition, MAROON_TOURNAMENT_SLUG } from "./editionScope.ts";
import type { LegacyTournamentAdapter } from "./legacyTournaments.ts";
import {
  maroonCanEnter, maroonMoreLinks, maroonPastEditions, maroonPlayingEditions, maroonSiteData, yourMaroonMatch, type MaroonRoundRow, type MaroonSite,
} from "./maroonAdapter.ts";
import type { PastTournament } from "./pastTournaments.ts";
import { playPath, type TournamentHome } from "./tournamentHome.ts";

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
  const [teams, settings, legacy, names, rounds, boxes] = await Promise.all([
    service.from("edition_teams").select("key, name, color").eq("edition_id", edition.id).order("sort_order"),
    service.from("edition_settings").select("scoring").eq("edition_id", edition.id).maybeSingle(),
    getSeasonTournament(year),
    getPlayerNameMap(),
    isHistory ? Promise.resolve(null) : service.from("live_round_state")
      .select("round, date, format, course_id, course_locked").match(editionFilter(maroonEdition(year))).order("round"),
    // Raw tee times, so the adapter can show them in the tournament's timezone (live years only).
    isHistory ? Promise.resolve(null) : service.from("live_match_boxes").select("id, tee_time").match(editionFilter(maroonEdition(year))),
  ]);
  if (teams.error) throw new Error(`Could not read the ${year} teams: ${teams.error.message}`);
  if (settings.error) throw new Error(`Could not read the ${year} settings: ${settings.error.message}`);
  if (rounds?.error) throw new Error(`Could not read the ${year} rounds: ${rounds.error.message}`);
  if (boxes?.error) throw new Error(`Could not read the ${year} tee times: ${boxes.error.message}`);

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
    ...(boxes ? { teeTimes: Object.fromEntries((boxes.data ?? []).flatMap((box) => (box.tee_time ? [[String(box.id), String(box.tee_time)]] : []))) } : {}),
  });
}

/**
 * The account's player(s) and every year one of them is on a roster (history
 * files + Admin Center). A player is linked by the claim (player_slots.claimed_by)
 * or by profiles.player_slug, the field the old portal's requirePlayer reads;
 * sign-up and invites set both, and only the server ever writes either.
 */
async function loadViewerRoster(viewerId: string): Promise<{ slugs: string[]; rosterYears: Set<number> }> {
  const service = createSupabaseServiceRoleClient();
  const [slots, profile] = await Promise.all([
    service.from("player_slots").select("player_slug").eq("claimed_by", viewerId),
    service.from("profiles").select("player_slug").eq("id", viewerId).maybeSingle(),
  ]);
  if (slots.error) throw new Error(`Could not read your player: ${slots.error.message}`);
  if (profile.error) throw new Error(`Could not read your profile: ${profile.error.message}`);
  const slugs = [...new Set([...(slots.data ?? []).map((row) => row.player_slug as string), ...(profile.data?.player_slug ? [profile.data.player_slug as string] : [])])];
  if (!slugs.length) return { slugs, rosterYears: new Set() };
  // A multi-year read of The Maroon's own roster (C4 list: becomes edition-keyed later).
  const { data: roster, error: rosterError } = await service.from("live_roster").select("season_year").in("player_slug", slugs);
  if (rosterError) throw new Error(`Could not read the roster: ${rosterError.message}`);
  const rosterYears = new Set((roster ?? []).map((row) => row.season_year as number));
  for (const t of pastTournaments) {
    if ([...t.roster.maroon, ...t.roster.white].some((raw) => slugs.includes(getPlayerSlug(raw)))) rosterYears.add(t.year);
  }
  return { slugs, rosterYears };
}

/**
 * The Maroon Tournament's rows for one account's lists, read live: unfinished
 * years for My Tournaments ("playing") or finished ones for Past Tournaments
 * and Profile ("past"). Roster = the history files for 2024–2026 and Admin
 * Center's live_roster after (not the one-time copy in edition_roster); venue
 * and dates = Admin Center's locked values. Throws on a database error.
 */
async function loadMaroonEditionRows(viewerId: string, which: "playing" | "past"): Promise<PastTournament[]> {
  const { rosterYears } = await loadViewerRoster(viewerId);
  if (!rosterYears.size) return [];
  const service = createSupabaseServiceRoleClient();
  const { data: tournament, error: tournamentError } = await service.from("tournaments")
    .select("id, slug, name").eq("slug", MAROON_TOURNAMENT_SLUG).eq("is_legacy", true).maybeSingle();
  if (tournamentError) throw new Error(`Could not read The Maroon Tournament: ${tournamentError.message}`);
  if (!tournament) return [];

  const years = [...rosterYears];
  const [editions, settings] = await Promise.all([
    service.from("tournament_editions").select("season_year, destination, start_date, end_date, timezone, is_test")
      .eq("tournament_id", tournament.id).in("season_year", years),
    service.from("live_tournament_settings").select("season_year, venue_name, venue_locked, begin_date, end_date, dates_locked")
      .in("season_year", years),
  ]);
  if (editions.error) throw new Error(`Could not read the editions: ${editions.error.message}`);
  if (settings.error) throw new Error(`Could not read the tournament settings: ${settings.error.message}`);

  const input = {
    slug: tournament.slug, name: tournament.name, rosterYears: years,
    editions: (editions.data ?? []).map((e) => ({
      seasonYear: e.season_year, destination: e.destination, startDate: e.start_date, endDate: e.end_date, timezone: e.timezone, isTest: e.is_test,
    })),
    settings: (settings.data ?? []).map((row) => ({
      seasonYear: row.season_year, venueName: row.venue_name, venueLocked: row.venue_locked === true,
      beginDate: row.begin_date, endDate: row.end_date, datesLocked: row.dates_locked === true,
    })),
  };
  return which === "playing" ? maroonPlayingEditions(input) : maroonPastEditions(input);
}

/** My Tournaments rows (unfinished years the viewer plays in). */
export function loadMyMaroonEditions(viewerId: string): Promise<PastTournament[]> {
  return loadMaroonEditionRows(viewerId, "playing");
}

/** Past Tournaments / Profile rows (finished years the viewer played in). */
export function loadMyPastMaroonEditions(viewerId: string): Promise<PastTournament[]> {
  return loadMaroonEditionRows(viewerId, "past");
}

/**
 * The Maroon Tournament's /play home for one year, or null when the year
 * doesn't exist, is the test season, or this viewer may not enter it
 * (maroonCanEnter: that year's roster players, Admin Center hosts, owners/
 * organizers, platform admins). Everything is read-only from the old system:
 * the Admin Center link uses Admin Center's own host check (requireHost) and
 * portal links the portal's own player check (requirePlayer). The activity
 * feed stays off for The Maroon this round.
 */
export async function loadMaroonHome(year: string, viewerId: string): Promise<TournamentHome | null> {
  if (!/^\d{4}$/.test(year)) return null;
  const seasonYear = Number(year);
  const service = createSupabaseServiceRoleClient();
  const { data: tournament, error } = await service.from("tournaments")
    .select("id").eq("slug", MAROON_TOURNAMENT_SLUG).eq("is_legacy", true).maybeSingle();
  if (error) throw new Error(`Could not read The Maroon Tournament: ${error.message}`);
  if (!tournament) return null;

  const [host, player, profile, member, viewer, editions] = await Promise.all([
    requireHost(),
    requirePlayer(),
    service.from("profiles").select("platform_role").eq("id", viewerId).maybeSingle(),
    service.from("tournament_members").select("role").eq("tournament_id", tournament.id).eq("profile_id", viewerId).maybeSingle(),
    loadViewerRoster(viewerId),
    service.from("tournament_editions").select("season_year, is_test").eq("tournament_id", tournament.id),
  ]);
  for (const result of [profile, member, editions]) {
    if (result.error) throw new Error(`Could not check access: ${result.error.message}`);
  }
  const canEnter = (y: number) => maroonCanEnter({
    isHost: host !== null,
    platformRole: (profile.data?.platform_role as string | null) ?? null,
    memberRole: (member.data?.role as string | null) ?? null,
    viewerSlugs: viewer.slugs,
    rosterSlugs: viewer.rosterYears.has(y) ? viewer.slugs : [],
  });
  if (!canEnter(seasonYear)) return null;

  const [maroon, activeYear] = await Promise.all([loadMaroonSite(seasonYear), getActiveSeasonYear()]);
  if (!maroon) return null;
  const { site, matchSessions } = maroon;
  const history = pastTournaments.find((t) => t.year === seasonYear);
  return {
    slug: MAROON_TOURNAMENT_SLUG, year: seasonYear, site,
    colors: { primary: site.branding.primary, accent: site.branding.accent },
    feed: null,
    basePath: playPath(MAROON_TOURNAMENT_SLUG, seasonYear),
    announcementsUrl: null,
    links: {
      website: "/website",
      commissioner: host ? { href: "/portal/admin", label: "Admin Center", note: "Rosters, matchups, scoring and settings" } : null,
      allTournaments: "/tournaments/join",
    },
    moreLinks: maroonMoreLinks({
      year: seasonYear, activeYear, historySlug: history?.slug ?? null,
      playerSlug: player?.playerSlug ?? null, onRoster: viewer.rosterYears.has(seasonYear),
    }),
    pastSeasons: (editions.data ?? [])
      .filter((e) => !e.is_test && e.season_year < seasonYear && canEnter(e.season_year))
      .map((e) => e.season_year as number).sort((a, b) => b - a)
      .map((y) => ({ year: y, href: playPath(MAROON_TOURNAMENT_SLUG, y) })),
    yourMatch: yourMaroonMatch(site, matchSessions, viewer.slugs),
    matchSessions,
    demo: false,
  };
}

/** The Maroon Tournament's entry in the legacy compatibility boundary (legacyTournaments.ts). */
export const maroonLegacyAdapter: LegacyTournamentAdapter = {
  slug: MAROON_TOURNAMENT_SLUG,
  loadHome: loadMaroonHome,
  loadPlayingRows: loadMyMaroonEditions,
  loadPastRows: loadMyPastMaroonEditions,
};
