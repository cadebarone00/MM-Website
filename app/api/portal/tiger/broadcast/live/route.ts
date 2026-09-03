import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getBroadcastDisplayYear, isValidDisplayYear } from "@/lib/broadcast/displayYear";

/**
 * Host-only "Go Live" / "End Broadcast" — the one action that publishes
 * whatever a Tiger has been rehearsing (see BroadcastControlsPanel.tsx) to
 * the real, shared /broadcast. Going live publishes `year` as the real
 * broadcast_display_year and starts that year's broadcast in normal auto
 * rotation (whatever scene was being rehearsed was just for checking the
 * look — going live starts the actual show). Ending it only flips
 * tournament_live off, on whichever year is currently published.
 *
 * Doesn't yet start "watching for video uploads" — that system doesn't
 * exist (Phase 3, not built). This is the flag it will key off later.
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { live, year } = await request.json();
  if (typeof live !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing live." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (!live) {
    const seasonYear = await getBroadcastDisplayYear();
    const { error } = await service.from("broadcast_state").upsert({ season_year: seasonYear, tournament_live: false, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ ok: false, error: "Could not end the broadcast." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!isValidDisplayYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }

  const { error: yearError } = await service.from("broadcast_display_year").upsert({ id: true, season_year: year });
  if (yearError) return NextResponse.json({ ok: false, error: "Could not publish the year." }, { status: 500 });

  const { error: stateError } = await service.from("broadcast_state").upsert({
    season_year: year,
    tournament_live: true,
    automation_mode: "auto",
    scene_started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (stateError) return NextResponse.json({ ok: false, error: "Could not go live." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
