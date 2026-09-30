import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { id } = await request.json();
  if (typeof id !== "string") {
    return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: match } = await service.from("live_match_boxes").select("season_year, round").eq("id", id).single();
  if (!match) {
    return NextResponse.json({ ok: false, error: "Match not found." }, { status: 404 });
  }

  const { data: sessionRow } = await service.from("live_round_state").select("matchups_locked").eq("season_year", match.season_year).eq("round", match.round).single();
  if (sessionRow?.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Unlock this session's matchups before removing a match." }, { status: 400 });
  }

  const { error } = await service.from("live_match_boxes").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not remove that match." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
