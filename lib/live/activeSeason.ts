import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { SEASON_YEARS } from "@/lib/live/seasonYears";

export { SEASON_YEARS, isValidSeasonYear } from "@/lib/live/seasonYears";

/**
 * Which season year is live right now for the public site and player
 * scoring — independent of whatever year a host happens to be viewing in
 * Master Settings. Always resolves (Task 1 seeds one row); a service-role
 * read, safe to call from Server Components and Route Handlers alike.
 */
export async function getActiveSeasonYear(): Promise<number> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("live_active_season").select("season_year").eq("id", true).single();
  if (error || !data) {
    console.warn("No active season is configured; using the default season.");
    return SEASON_YEARS[0];
  }
  return data.season_year;
}
