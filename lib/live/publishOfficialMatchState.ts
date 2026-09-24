import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { buildOfficialMatchState, type OfficialMatchState } from "@/lib/live/officialMatchState";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { publishMatchOdds } from "@/lib/live/publishMatchOdds";
import { refreshFutures } from "@/lib/wagers/refreshFutures";

/**
 * Rebuild and publish a match using confirmed holes only. This is the shared
 * server-side handoff point for score routes, Tiger corrections, and later
 * tee-time/start-match automation. It is intentionally idempotent: a retry
 * replaces current state rather than incrementing points or settling wagers.
 */
export async function publishOfficialMatchState(
  seasonYear: number,
  matchBoxId: string,
  auditKind?: "match_locked" | "match_updated",
  { futuresPricingBudgetMs = 0 }: { futuresPricingBudgetMs?: number } = {}
): Promise<OfficialMatchState | null> {
  const service = createSupabaseServiceRoleClient();
  const { data: job, error: jobError } = await service.from("live_publication_jobs").select("revision").eq("match_box_id", matchBoxId).maybeSingle();
  if (jobError) throw jobError;
  const snapshot = await buildLiveTournamentSnapshot(seasonYear, { confirmedOnly: true });
  const box = snapshot.matchBoxes.find((candidate) => candidate.id === matchBoxId);
  if (!box) return null;

  const official = buildOfficialMatchState(snapshot, box);
  const odds = await publishMatchOdds(seasonYear, box, official, true);
  const { data: published, error } = await service.rpc("publish_match_revision", { p_box: matchBoxId, p_revision: job?.revision ?? 0, p_state: official, p_odds: odds });
  if (error) throw error;
  if (!published) throw new Error("Scores changed while publishing; queued for retry.");

  if (auditKind) {
    const { error: auditError } = await service.from("live_score_audit_events").insert({
      season_year: seasonYear,
      match_box_id: matchBoxId,
      round: box.round,
      kind: auditKind,
      payload: { thru: official.thru, leader: official.leader, margin: official.margin, mathematicallyComplete: official.mathematicallyComplete },
    });
    if (auditError) throw auditError;
  }

  // Tournament futures depend on every match and on every new hole in the
  // Career Archive; bets on them pause until this lands. A pricing budget
  // (background callers only) also re-prices affected Team Winner matchups.
  await refreshFutures(seasonYear, { teamWinnerPricingBudgetMs: futuresPricingBudgetMs });

  return official;
}
