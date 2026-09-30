import { cache } from "react";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { PublicTournament } from "./publicSite.ts";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const YEAR = /^\d{4}$/;

/** The signed-in viewer (for private tournaments), or null. Never trusted from the request. */
async function viewerId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
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
