import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear } from "@/lib/broadcast/displayYear";

/**
 * Host-only "Go Live" / "End Broadcast" for whichever year is currently
 * displayed. Today this just gates the Holding scene (see
 * components/broadcast/SceneRenderer.tsx) — the hook a future video system
 * (Phase 3, not built yet) will key "start watching for uploads" off later,
 * not something this route does itself yet.
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { live } = await request.json();
  if (typeof live !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing live." }, { status: 400 });
  }

  const seasonYear = await getBroadcastDisplayYear();
  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("broadcast_state").upsert({ season_year: seasonYear, tournament_live: live, updated_at: new Date().toISOString() });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not update the broadcast." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
