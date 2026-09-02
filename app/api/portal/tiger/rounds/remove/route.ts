import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, round } = await request.json();
  if (!isValidSeasonYear(year) || typeof round !== "number") {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: current } = await service.from("live_round_state").select("course_locked, matchups_locked").eq("season_year", year).eq("round", round).single();
  if (current?.course_locked || current?.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Unlock this round before removing it." }, { status: 400 });
  }

  const { error: boxesError } = await service.from("live_match_boxes").delete().eq("season_year", year).eq("round", round);
  if (boxesError) {
    return NextResponse.json({ ok: false, error: "Could not remove that round's match boxes." }, { status: 500 });
  }

  const { error } = await service.from("live_round_state").delete().eq("season_year", year).eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not remove that round." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
