import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";

/** Clears the shared anchor so audio stops for Tiger and all live listeners. */
export async function POST() {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });

  const seasonYear = await getBroadcastDisplayYear();
  const service = createSupabaseServiceRoleClient();
  const { error } = await service
    .from("broadcast_state")
    .upsert({ season_year: seasonYear, audio_track_id: null, audio_started_at: null, updated_at: new Date().toISOString() });
  if (error) {
    console.error("playlist/pause: failed to clear broadcast audio", error);
    return NextResponse.json({ ok: false, error: "Could not pause the playlist." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
