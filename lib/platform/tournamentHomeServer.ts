import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadTournamentActivity } from "./activityServer.ts";
import { legacyAdapterFor } from "./legacyTournaments.ts";
import { publicBasePath, toSiteData } from "./publicSite.ts";
import { loadPublicTournament } from "./publicSiteServer.ts";
import { playPath, type TournamentHome } from "./tournamentHome.ts";

export type { TournamentHome } from "./tournamentHome.ts";

/**
 * Everything a /play/<tournament>/<year> screen shows. Signed-in only.
 * Access is the public site's own rule (get_public_tournament_site: published,
 * not a test season, private = members only, never a legacy tournament), and the feed
 * is whatever get_tournament_activity lets this viewer see.
 */
export const loadTournamentHome = cache(async (slug: string, year: string): Promise<TournamentHome> => {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) redirect("/login");
  // A tournament still on a legacy system is answered by its adapter (access included).
  const legacy = legacyAdapterFor(slug);
  if (legacy) return (await legacy.loadHome(year, user.id)) ?? notFound();
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
      commissioner: feed?.viewer.canPostAnnouncement
        ? { href: `/tournaments/${encodeURIComponent(realSlug)}/${realYear}`, label: "Commissioner tools", note: "Tournament Studio: setup, players, schedule" }
        : null,
      allTournaments: "/tournaments/join",
    },
    moreLinks: [],
    pastSeasons: [],
    // Pairings come with live scoring (C4); until then there is no match to point at.
    yourMatch: null,
    matchSessions: {},
    demo: false,
  };
});

