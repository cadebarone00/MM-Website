import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { cache } from "react";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { PublicTournament } from "./publicSite.ts";
import { resolveManagedEdition } from "./dashboardServer.ts";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const YEAR = /^\d{4}$/;

/** The signed-in viewer's profile (for private tournaments), or null. Never trusted from the request. */
async function viewerId(): Promise<string | null> {
  const current = await getCurrentProfile();
  return current.status === "ok" ? current.profile.profileId : null;
}

/**
 * The one visitor-safe loader for /t/[tournament]/[year]. Returns only what
 * get_public_tournament_site allows this viewer to see, or null (also for
 * malformed slugs/years, which never reach the database).
 */
export const loadPublicTournament = cache(async (slug: string, year: string): Promise<PublicTournament | null> => {
  if (!SLUG.test(slug) || !YEAR.test(year)) return null;
  const { data, error } = await createSupabaseServiceRoleClient()
    .rpc("get_public_tournament_site", { p_slug: slug, p_year: Number(year), p_viewer: await viewerId() });
  if (error) {
    // Platform not set up in this database yet, or a real failure: either way the visitor sees "not found".
    if (error.code !== "PGRST202") console.error("get_public_tournament_site failed:", error.message);
    return null;
  }
  return (data as PublicTournament | null) ?? null;
});

/** Newest published year this viewer may see, for /t/[tournament]. */
export async function latestPublicYear(slug: string): Promise<number | null> {
  if (!SLUG.test(slug)) return null;
  const { data, error } = await createSupabaseServiceRoleClient()
    .rpc("get_public_tournament_years", { p_slug: slug, p_viewer: await viewerId() });
  if (error || !Array.isArray(data) || !data.length) return null;
  return Number(data[0]);
}

export interface TournamentPreview {
  tournament: PublicTournament;
  published: boolean;
}

/**
 * Organizer-only preview of the public site (Tournament Dashboard → Preview
 * Website). Uses the dashboard's organizer check, never the public rules:
 * unpublished and private editions are shown only to the tournament's
 * organizers/owner and platform admins. Returns null for everyone else, and
 * for The Maroon Tournament (run from the Admin Center).
 */
export const loadTournamentPreview = cache(async (slug: string, year: string): Promise<TournamentPreview | null> => {
  if (!SLUG.test(slug) || !YEAR.test(year)) return null;
  const edition = await resolveManagedEdition(slug, year);
  if (!edition) return null;
  const { data, error } = await createSupabaseServiceRoleClient()
    .rpc("get_tournament_site_preview", { p_profile: edition.profileId, p_edition: edition.editionId });
  if (error || !data) {
    if (error && error.code !== "42501" && error.code !== "PGRST202") console.error("get_tournament_site_preview failed:", error.message);
    return null;
  }
  const preview = data as { site: PublicTournament | null; published: boolean };
  return preview.site ? { tournament: preview.site, published: preview.published === true } : null;
});
