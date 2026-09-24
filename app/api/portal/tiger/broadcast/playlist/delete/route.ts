// app/api/portal/tiger/broadcast/playlist/delete/route.ts
import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { createR2Client, R2_BUCKET } from "@/lib/r2/client";

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
    .select("id, storage_path")
    .eq("id", trackId)
    .eq("season_year", seasonYear)
    .maybeSingle();
  if (trackError) console.error("playlist/delete: failed to look up track", trackError);
  if (!track) {
    return NextResponse.json({ ok: false, error: "That track isn't in this year's playlist." }, { status: 404 });
  }

  try {
    const r2 = createR2Client();
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: track.storage_path }));
  } catch (err) {
    console.error("playlist/delete: failed to delete R2 object, deleting the DB row anyway", { storagePath: track.storage_path, err });
  }

  const { error: deleteError } = await service.from("broadcast_playlist_tracks").delete().eq("id", trackId);
  if (deleteError) {
    console.error("playlist/delete: failed to delete track row", deleteError);
    return NextResponse.json({ ok: false, error: "Could not remove that track." }, { status: 500 });
  }

  // Stop playback cleanly if the deleted track was the one currently
  // anchoring it — otherwise every viewer keeps trying to play a URL that
  // no longer exists.
  const { error: stateError } = await service
    .from("broadcast_state")
    .update({ audio_track_id: null, audio_started_at: null, updated_at: new Date().toISOString() })
    .eq("season_year", seasonYear)
    .eq("audio_track_id", trackId);
  if (stateError) console.error("playlist/delete: failed to clear now-playing track", stateError);

  return NextResponse.json({ ok: true });
}
