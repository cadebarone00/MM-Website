import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round } = await request.json();
  if (typeof round !== "number") {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: current } = await service.from("live_round_state").select("course_locked, matchups_locked").eq("round", round).single();
  if (current?.course_locked || current?.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Unlock this round before removing it." }, { status: 400 });
  }

  // live_match_boxes.round references live_round_state(round) with no cascade,
  // so any leftover boxes for this round have to go first or the delete below
  // fails on a foreign key violation with no way for Tiger to clear them.
  const { error: boxesError } = await service.from("live_match_boxes").delete().eq("round", round);
  if (boxesError) {
    return NextResponse.json({ ok: false, error: "Could not remove that round's match boxes." }, { status: 500 });
  }

  const { error } = await service.from("live_round_state").delete().eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not remove that round." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
