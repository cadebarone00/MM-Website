import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round } = await request.json();
  if (typeof round !== "number" || !Number.isInteger(round)) {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: current } = await service.from("live_round_state").select("course_locked, matchups_locked, started").eq("round", round).single();
  if (!current) {
    return NextResponse.json({ ok: false, error: "Round not found." }, { status: 404 });
  }
  if (!current.course_locked || !current.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Lock both Courses & Format and Matchups before starting this round." }, { status: 400 });
  }
  if (current.started) {
    return NextResponse.json({ ok: false, error: "This round has already started." }, { status: 400 });
  }

  const { error } = await service.from("live_round_state").update({ started: true }).eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not start that round." }, { status: 500 });
  }

  const { error: boxesError } = await service.from("live_match_boxes").update({ started: true }).eq("round", round);
  if (boxesError) {
    return NextResponse.json({ ok: false, error: "Round was marked started, but could not open its match boxes." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
