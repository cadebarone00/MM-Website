import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });

  const { year, playerSlug, locked } = await request.json();
  if (!isValidSeasonYear(year) || typeof playerSlug !== "string" || typeof locked !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: slot } = await service.from("player_slots").select("player_slug").eq("player_slug", playerSlug).maybeSingle();
  if (!slot) return NextResponse.json({ ok: false, error: "Unknown player." }, { status: 400 });

  const { error } = locked
    ? await service.from("live_roster_assignment_locks").upsert({ season_year: year, player_slug: playerSlug, locked_at: new Date().toISOString() })
    : await service.from("live_roster_assignment_locks").delete().eq("season_year", year).eq("player_slug", playerSlug);
  if (error) return NextResponse.json({ ok: false, error: "Could not update that team lock." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
