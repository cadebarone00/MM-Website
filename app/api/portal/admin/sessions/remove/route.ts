import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, session } = await request.json();
  if (!isValidSeasonYear(year) || typeof session !== "number") {
    return NextResponse.json({ ok: false, error: "Missing session." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: current } = await service.from("live_round_state").select("course_locked, matchups_locked").eq("season_year", year).eq("round", session).single();
  if (current?.course_locked || current?.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Unlock this session before removing it." }, { status: 400 });
  }

  const { error: matchesError } = await service.from("live_match_boxes").delete().eq("season_year", year).eq("round", session);
  if (matchesError) {
    return NextResponse.json({ ok: false, error: "Could not remove that session's matches." }, { status: 500 });
  }

  const { error } = await service.from("live_round_state").delete().eq("season_year", year).eq("round", session);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not remove that session." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
