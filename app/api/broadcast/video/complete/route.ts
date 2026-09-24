import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";

/** Marks the finished clip played, then immediately starts the next queued
 * transition or releases the broadcast back to its normal rotation. */
export async function POST() {
  const seasonYear = await getBroadcastDisplayYear();
  const service = createSupabaseServiceRoleClient();
  const { data: state } = await service.from("broadcast_state").select("active_video_queue_id, video_phase").eq("season_year", seasonYear).maybeSingle();
  if (!state?.active_video_queue_id || state.video_phase !== "playing") return NextResponse.json({ ok: true });

  await service.from("broadcast_player_video_queue").update({ status: "played", played_at: new Date().toISOString() }).eq("id", state.active_video_queue_id);
  const { data: next } = await service
    .from("broadcast_player_video_queue").select("id").eq("season_year", seasonYear).eq("status", "queued").order("queued_at").limit(1).maybeSingle();

  if (next) {
    await service.from("broadcast_player_video_queue").update({ status: "transition" }).eq("id", next.id);
    await service.from("broadcast_state").update({ video_phase: "transition", active_video_queue_id: next.id, video_phase_started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("season_year", seasonYear);
  } else {
    await service.from("broadcast_state").update({ video_phase: null, active_video_queue_id: null, video_phase_started_at: null, updated_at: new Date().toISOString() }).eq("season_year", seasonYear);
  }
  return NextResponse.json({ ok: true });
}
