import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { editionFilter, maroonEdition } from "@/lib/platform/editionScope";

const TRANSITION_MS = 4000;

/** Public but fully state-guarded: a viewer may advance only the currently
 * active transition, and only after its four-second card has elapsed. */
export async function POST() {
  const seasonYear = await getBroadcastDisplayYear();
  const edition = maroonEdition(seasonYear);
  const service = createSupabaseServiceRoleClient();
  const { data: state } = await service.from("broadcast_state").select("active_video_queue_id, video_phase, video_phase_started_at").match(editionFilter(edition)).maybeSingle();
  if (!state?.active_video_queue_id || state.video_phase !== "transition" || !state.video_phase_started_at) return NextResponse.json({ ok: true });
  if (Date.now() - new Date(state.video_phase_started_at).getTime() < TRANSITION_MS) return NextResponse.json({ ok: false, error: "Transition is still running." }, { status: 409 });

  await service.from("broadcast_player_video_queue").update({ status: "playing" }).eq("id", state.active_video_queue_id).eq("status", "transition");
  const { error } = await service.from("broadcast_state")
    .update({ video_phase: "playing", video_phase_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .match(editionFilter(edition)).eq("active_video_queue_id", state.active_video_queue_id).eq("video_phase", "transition");
  if (error) return NextResponse.json({ ok: false, error: "Could not start the video." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
