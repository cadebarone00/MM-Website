import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { publishOfficialMatchState } from "./publishOfficialMatchState";
import { editionFilter, type EditionScope } from "@/lib/platform/editionScope";

/** Durable jobs survive server restarts. Active score/public refreshes retry them. */
export async function retryPendingPublications(edition: EditionScope, matchBoxId?: string) {
  const service = createSupabaseServiceRoleClient();
  let query = service.from("live_publication_jobs").select("match_box_id").match(editionFilter(edition)).eq("completed", false).order("updated_at").limit(2);
  if (matchBoxId) query = query.eq("match_box_id", matchBoxId);
  const { data, error } = await query;
  if (error) { console.error("Could not check pending publication:", error.message); return; }
  for (const job of data ?? []) {
    try { await publishOfficialMatchState(edition, job.match_box_id); }
    catch (error) { console.error("Match publication remains queued:", error); }
  }
}
