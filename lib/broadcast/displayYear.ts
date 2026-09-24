// lib/broadcast/displayYear.ts
//
// Server-only (pulls in @/lib/supabase/server via next/headers) — only
// import from a Route Handler or Server Component. lib/broadcast/displayYears.ts
// holds the plain constants a Client Component can safely import instead.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export { DISPLAY_YEARS, isValidDisplayYear } from "@/lib/broadcast/displayYears";

/**
 * Which year's data /broadcast currently shows — set via Broadcast
 * Controls, deliberately independent of live_active_season (see the spec
 * addendum in supabase/schema.sql's "Watch Live Broadcast: display year"
 * section). Always resolves; falls back to 2027 if the row is somehow
 * missing.
 */
export async function getBroadcastDisplayYear(): Promise<number> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("broadcast_display_year").select("season_year").eq("id", true).maybeSingle();
  if (error) console.error("broadcast_display_year read failed, falling back to 2027:", error.message);
  return data?.season_year ?? 2027;
}
