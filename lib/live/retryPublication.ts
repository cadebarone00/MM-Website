import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { publishOfficialMatchState } from "./publishOfficialMatchState";

/** Durable jobs survive server restarts. Active score/public refreshes retry them. */
export async function retryPendingPublications(seasonYear: number, matchBoxId?: string) {
  const service = createSupabaseServiceRoleClient();
  let query = service.from("live_publication_jobs").select("match_box_id").eq("season_year", seasonYear).eq("completed", false).order("updated_at").limit(2);
  if (matchBoxId) query = query.eq("match_box_id", matchBoxId);
  const { data, error } = await query;
  if (error) { console.error("Could not check pending publication:", error.message); return; }
  for (const job of data ?? []) {
    try { await publishOfficialMatchState(seasonYear, job.match_box_id); }
    catch (error) { console.error("Match publication remains queued:", error); }
  }
}
