// app/api/portal/tiger/broadcast/playlist/upload/confirm/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { r2PublicUrl } from "@/lib/r2/client";

/**
 * Second half of the direct-to-storage upload flow — called once the
 * browser has already PUT the file to R2 using the presigned URL from
 * .../upload/sign. Never touches the file itself, same as
 * .../scorecards/video/confirm. `durationSeconds` is measured client-side
 * (see BroadcastControlsPanel's playlist upload code) — no server-side
 * audio processing.
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { title, storagePath, durationSeconds } = await request.json();
  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof storagePath !== "string" ||
    !storagePath.startsWith("playlist/") ||
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const seasonYear = await getBroadcastDisplayYear();
  const service = createSupabaseServiceRoleClient();

  const { data, error } = await service
    .from("broadcast_playlist_tracks")
    .insert({ season_year: seasonYear, title: title.trim(), storage_path: storagePath, duration_seconds: durationSeconds })
    .select("id, title, storage_path, duration_seconds, uploaded_at")
    .single();

  if (error || !data) {
    console.error("playlist/upload/confirm: failed to insert track", error);
    return NextResponse.json({ ok: false, error: "Uploaded, but could not save it to the playlist." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    track: { id: data.id, title: data.title, url: r2PublicUrl(data.storage_path), durationSeconds: Number(data.duration_seconds), uploadedAt: data.uploaded_at },
  });
}
