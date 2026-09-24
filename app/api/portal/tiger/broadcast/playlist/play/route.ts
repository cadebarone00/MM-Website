// app/api/portal/tiger/broadcast/playlist/play/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";

/**
 * Sets which track anchors playback and restarts it from the beginning
 * (offset 0) — see lib/broadcast/playlistPlayback.ts for how every client
 * derives its own playhead from this anchor. Does not touch audio_loop_mode
 * — a host can Play a different track without losing their loop-mode
 * choice.
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { trackId } = await request.json();
  if (typeof trackId !== "string" || !trackId) {
    return NextResponse.json({ ok: false, error: "Missing trackId." }, { status: 400 });
  }

  const seasonYear = await getBroadcastDisplayYear();
  const service = createSupabaseServiceRoleClient();

  const { data: track, error: trackError } = await service
    .from("broadcast_playlist_tracks")
    .select("id")
    .eq("id", trackId)
    .eq("season_year", seasonYear)
    .maybeSingle();
  if (trackError) console.error("playlist/play: failed to look up track", trackError);
  if (!track) {
    return NextResponse.json({ ok: false, error: "That track isn't in this year's playlist." }, { status: 404 });
  }

  const { error } = await service
    .from("broadcast_state")
    .upsert({ season_year: seasonYear, audio_track_id: trackId, audio_started_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  if (error) {
    console.error("playlist/play: failed to update broadcast_state", error);
    return NextResponse.json({ ok: false, error: "Could not start that track." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
