import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const SEASON_YEARS: number[] = [2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034];

export function isValidSeasonYear(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && SEASON_YEARS.includes(value);
}

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
    throw new Error("No active season is configured.");
  }
  return data.season_year;
}
