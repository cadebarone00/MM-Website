import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { liveEventsFrom, type LiveEvent } from "./liveDirectory.ts";

/**
 * The Maroon Live directory (supabase/maroon_live_directory.sql), read with the service key: only Public events, golf
 * details only. "not_installed" until that file is run. Never import this from a client component.
 */
export async function loadLiveDirectory(query: string): Promise<{ status: "ok"; events: LiveEvent[] } | { status: "not_installed" | "failed" }> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("list_public_live_events", { p_query: query.slice(0, 80) });
  if (error) {
    if (["PGRST202", "42883", "42P01", "42703"].includes(error.code)) return { status: "not_installed" };
    console.error("list_public_live_events failed:", error.message);
    return { status: "failed" };
  }
  return { status: "ok", events: liveEventsFrom(data) };
}
