// app/api/portal/admin/broadcast/playlist/loop-mode/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";
import { editionColumns, maroonEdition } from "@/lib/platform/editionScope";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { mode } = await request.json();
  if (mode !== "one" && mode !== "all") {
    return NextResponse.json({ ok: false, error: "Invalid loop mode." }, { status: 400 });
  }

  const seasonYear = await getBroadcastDisplayYear();
  const edition = maroonEdition(seasonYear);
  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("broadcast_state").upsert({ ...editionColumns(edition), audio_loop_mode: mode, updated_at: new Date().toISOString() });
  if (error) {
    console.error("playlist/loop-mode: failed to update broadcast_state", error);
    return NextResponse.json({ ok: false, error: "Could not change loop mode." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
