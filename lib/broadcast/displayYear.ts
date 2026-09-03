// lib/broadcast/displayYear.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Years selectable in Broadcast Controls today. 2026 has real (archived) data to preview the look against; 2027 is the live one. Widen this later as more years get real data behind them — the database column itself already allows 2024-2034. */
export const DISPLAY_YEARS = [2026, 2027] as const;

export function isValidDisplayYear(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && (DISPLAY_YEARS as readonly number[]).includes(value);
}

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
