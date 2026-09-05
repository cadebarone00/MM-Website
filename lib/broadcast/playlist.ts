// lib/broadcast/playlist.ts
//
// Server-only (pulls in @/lib/supabase/server via next/headers) — only call
// from a Route Handler or Server Component, same rule as
// lib/broadcast/state.ts.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { r2PublicUrl } from "@/lib/r2/client";

export interface PlaylistTrack {
  id: string;
  title: string;
  url: string;
  durationSeconds: number;
  uploadedAt: string; // ISO timestamp
}

/**
 * Every uploaded track for whichever year Broadcast Controls has picked
 * (`broadcast_display_year`), oldest-uploaded first — that upload order is
 * playback order for "loop all" (see lib/broadcast/playlistPlayback.ts).
 * `overrideYear` exists only for symmetry with getBroadcastLeaderboard/
 * getBroadcastMatchPlay; nothing calls it with one today since the
 * Playlist tab only shows once live, on the real published year.
 */
export async function getBroadcastPlaylist(overrideYear?: number): Promise<{ seasonYear: number; tracks: PlaylistTrack[] }> {
  const seasonYear = overrideYear ?? (await getBroadcastDisplayYear());
  const service = createSupabaseServiceRoleClient();

  const { data, error } = await service
    .from("broadcast_playlist_tracks")
    .select("id, title, storage_path, duration_seconds, uploaded_at")
    .eq("season_year", seasonYear)
    .order("uploaded_at", { ascending: true });

  if (error) {
    console.error("broadcast_playlist_tracks read failed, returning empty playlist:", error.message);
    return { seasonYear, tracks: [] };
  }

  const tracks: PlaylistTrack[] = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    url: r2PublicUrl(row.storage_path),
    durationSeconds: Number(row.duration_seconds),
    uploadedAt: row.uploaded_at,
  }));

  return { seasonYear, tracks };
}
