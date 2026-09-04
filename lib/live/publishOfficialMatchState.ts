import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { buildOfficialMatchState, type OfficialMatchState } from "@/lib/live/officialMatchState";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Rebuild and publish a match using confirmed holes only. This is the shared
 * server-side handoff point for score routes, Tiger corrections, and later
 * tee-time/start-match automation. It is intentionally idempotent: a retry
 * replaces current state rather than incrementing points or settling wagers.
 */
export async function publishOfficialMatchState(seasonYear: number, matchBoxId: string): Promise<OfficialMatchState | null> {
  const snapshot = await buildLiveTournamentSnapshot(seasonYear, { confirmedOnly: true });
  const box = snapshot.matchBoxes.find((candidate) => candidate.id === matchBoxId);
  if (!box) return null;

  const official = buildOfficialMatchState(snapshot, box);
  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("live_match_official_state").upsert({
    match_box_id: matchBoxId,
    season_year: seasonYear,
    round: box.round,
    status: official.status,
    thru: official.thru,
    maroon_holes: official.maroonHoles,
    white_holes: official.whiteHoles,
    leader: official.leader,
    margin: official.margin,
    mathematically_complete: official.mathematicallyComplete,
    official_result: official.officialResult,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;

  const { error: auditError } = await service.from("live_score_audit_events").insert({
    season_year: seasonYear,
    match_box_id: matchBoxId,
    round: box.round,
    kind: "score_confirmed",
    payload: { thru: official.thru, leader: official.leader, margin: official.margin, mathematicallyComplete: official.mathematicallyComplete },
  });
  if (auditError) throw auditError;

  return official;
}
