import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { TournamentSiteData } from "@/components/platform/tournament-site/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TournamentActivityFeed } from "./activity.ts";
import { loadTournamentActivity } from "./activityServer.ts";
import { toSiteData } from "./publicSite.ts";
import { loadPublicTournament } from "./publicSiteServer.ts";

export interface TournamentHome {
  slug: string;
  year: number;
  site: TournamentSiteData;
  /** null when the activity feed is unavailable; the home page then hides those sections. */
  feed: TournamentActivityFeed | null;
}

/**
 * Everything a /play/<tournament>/<year> screen shows. Signed-in only.
 * Access is the public site's own rule (get_public_tournament_site: published,
 * not a test season, private = members only, never The Maroon), and the feed
 * is whatever get_tournament_activity lets this viewer see.
 */
export const loadTournamentHome = cache(async (slug: string, year: string): Promise<TournamentHome> => {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) redirect("/login");
  const tournament = await loadPublicTournament(slug, year);
  if (!tournament) notFound();
  const feed = await loadTournamentActivity(tournament.tournament.slug, tournament.edition.seasonYear);
  return { slug: tournament.tournament.slug, year: tournament.edition.seasonYear, site: toSiteData(tournament), feed };
});
