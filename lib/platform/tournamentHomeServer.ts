import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadTournamentActivity } from "./activityServer.ts";
import { MAROON_TOURNAMENT_SLUG } from "./editionScope.ts";
import { loadMaroonSite } from "./maroonAdapterServer.ts";
import { publicBasePath, toSiteData } from "./publicSite.ts";
import { loadPublicTournament } from "./publicSiteServer.ts";
import { playPath, type TournamentHome } from "./tournamentHome.ts";

export type { TournamentHome } from "./tournamentHome.ts";

/**
 * Everything a /play/<tournament>/<year> screen shows. Signed-in only.
 * Access is the public site's own rule (get_public_tournament_site: published,
 * not a test season, private = members only, never The Maroon), and the feed
 * is whatever get_tournament_activity lets this viewer see.
 */
export const loadTournamentHome = cache(async (slug: string, year: string): Promise<TournamentHome> => {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) redirect("/login");
  if (slug === MAROON_TOURNAMENT_SLUG) return loadMaroonHome(year);
  const tournament = await loadPublicTournament(slug, year);
  if (!tournament) notFound();
  const feed = await loadTournamentActivity(tournament.tournament.slug, tournament.edition.seasonYear);
  const hex = (value: unknown) => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null);
  const colors = { primary: hex(tournament.tournament.branding.primary), accent: hex(tournament.tournament.branding.accent) };
  const realSlug = tournament.tournament.slug;
  const realYear = tournament.edition.seasonYear;
  return {
    slug: realSlug, year: realYear, site: toSiteData(tournament), colors, feed,
    basePath: playPath(realSlug, realYear),
    announcementsUrl: `/api/platform/tournaments/${encodeURIComponent(realSlug)}/${realYear}/announcements`,
    links: {
      website: publicBasePath(realSlug, realYear),
      // The backend's own capability; the Tournament Studio checks access again.
      commissioner: feed?.viewer.canPostAnnouncement ? `/tournaments/${encodeURIComponent(realSlug)}/${realYear}` : null,
      allTournaments: "/tournaments/join",
    },
    // Pairings come with live scoring (C4); until then there is no match to point at.
    yourMatch: null,
    matchSessions: {},
    demo: false,
  };
});

/**
 * The founding tournament's home (Maroon migration Phase 3). Its data comes
 * read-only from the Maroon adapter, not get_public_tournament_site (which
 * deliberately excludes it). Signed-in only, like every home; the same
 * information is already public on the old site. Activity, "your match" and
 * the commissioner link are Phase 4, so they stay off here.
 */
async function loadMaroonHome(year: string): Promise<TournamentHome> {
  if (!/^\d{4}$/.test(year)) notFound();
  const maroon = await loadMaroonSite(Number(year));
  if (!maroon) notFound();
  const { site, matchSessions } = maroon;
  const seasonYear = Number(year);
  return {
    slug: MAROON_TOURNAMENT_SLUG, year: seasonYear, site,
    colors: { primary: site.branding.primary, accent: site.branding.accent },
    feed: null,
    basePath: playPath(MAROON_TOURNAMENT_SLUG, seasonYear),
    announcementsUrl: null,
    links: { website: "/website", commissioner: null, allTournaments: "/tournaments/join" },
    yourMatch: null,
    matchSessions,
    demo: false,
  };
}
