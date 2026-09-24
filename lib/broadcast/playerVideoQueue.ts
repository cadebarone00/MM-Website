import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { r2PublicUrl } from "@/lib/r2/client";

function seasonFromTournamentSlug(slug: string): number | null {
  const year = Number(slug.slice(0, 4));
  return Number.isInteger(year) && year >= 2024 && year <= 2034 ? year : null;
}

/** Queue a freshly-confirmed scorecard clip and start its shared transition
 * when nothing is currently on air. The queue is deliberately server-owned:
 * viewers only advance/complete the already-selected clip. */
export async function queuePlayerVideo(input: {
  videoId: string;
  tournamentSlug: string;
  playerSlug: string;
  round: number;
  hole: number;
  shotNumber: number;
  par: number;
  yards: number;
  storagePath: string;
}) {
  const seasonYear = seasonFromTournamentSlug(input.tournamentSlug);
  if (!seasonYear) return;
  const service = createSupabaseServiceRoleClient();
  const profile = getPlayerProfileBySlug(input.playerSlug);

  const { data: roundRows } = await service
    .from("archived_scorecard_rounds")
    .select("id")
    .eq("tournament_slug", input.tournamentSlug)
    .eq("player_slug", input.playerSlug);
  const roundIds = (roundRows ?? []).map((row) => row.id);
  let scoreToPar: number | null = null;
  if (roundIds.length > 0) {
    const { data: holes } = await service.from("archived_scorecard_holes").select("score, par").in("round_id", roundIds);
    if (holes?.length) scoreToPar = holes.reduce((total, row) => total + row.score - row.par, 0);
  }

  const { data: queued, error } = await service
    .from("broadcast_player_video_queue")
    .upsert({
      season_year: seasonYear, video_id: input.videoId, tournament_slug: input.tournamentSlug, player_slug: input.playerSlug,
      player_name: profile?.fullName ?? input.playerSlug, round: input.round, hole: input.hole, shot_number: input.shotNumber,
      par: input.par, yards: input.yards, score_to_par: scoreToPar, video_url: r2PublicUrl(input.storagePath), status: "queued", queued_at: new Date().toISOString(),
    }, { onConflict: "video_id" })
    .select("id")
    .single();
  if (error || !queued) {
    console.error("player video queue insert failed:", error?.message);
    return;
  }

  const { data: state } = await service.from("broadcast_state").select("video_phase, active_video_queue_id").eq("season_year", seasonYear).maybeSingle();
  if (state?.video_phase || state?.active_video_queue_id) return;

  // First submitted clip gets the transition. Later clips wait for complete.
  await service.from("broadcast_player_video_queue").update({ status: "transition" }).eq("id", queued.id);
  const { error: activateError } = await service.from("broadcast_state").upsert({
    season_year: seasonYear, video_phase: "transition", active_video_queue_id: queued.id, video_phase_started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  if (activateError) console.error("player video queue activation failed:", activateError.message);
}
