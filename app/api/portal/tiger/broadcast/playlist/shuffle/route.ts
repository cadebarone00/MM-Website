// app/api/portal/tiger/broadcast/playlist/shuffle/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";

/**
 * Toggles shuffle for loop_mode "all" — ignored entirely when loop_mode is
 * "one" (see lib/broadcast/playlistPlayback.ts's playlistTickAt()). Same
 * pattern as .../loop-mode.
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { shuffle } = await request.json();
  if (typeof shuffle !== "boolean") {
    return NextResponse.json({ ok: false, error: "Invalid shuffle value." }, { status: 400 });
  }

  const seasonYear = await getBroadcastDisplayYear();
  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("broadcast_state").upsert({ season_year: seasonYear, audio_shuffle: shuffle, updated_at: new Date().toISOString() });
  if (error) {
    console.error("playlist/shuffle: failed to update broadcast_state", error);
    return NextResponse.json({ ok: false, error: "Could not change shuffle." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
