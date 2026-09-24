import { NextResponse } from "next/server";
import { getBroadcastPlaylist } from "@/lib/broadcast/playlist";

/** Public, unauthenticated — re-fetched by /watch-live's player whenever Realtime signals a broadcast_playlist_tracks change (see lib/broadcast/usePlaylistTracks.ts). */
export async function GET() {
  const payload = await getBroadcastPlaylist();
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
