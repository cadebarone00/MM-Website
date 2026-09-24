import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Tiger's per-box tee-time override. The round must already be armed. */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });

  const { id } = await request.json();
  if (typeof id !== "string" || !id) return NextResponse.json({ ok: false, error: "Missing match box." }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const { data: box } = await service.from("live_match_boxes").select("id, season_year, round, state").eq("id", id).single();
  if (!box) return NextResponse.json({ ok: false, error: "Match box not found." }, { status: 404 });
  if (box.state === "Final") return NextResponse.json({ ok: false, error: "This match is already final." }, { status: 400 });

  const { data: round } = await service
    .from("live_round_state")
    .select("course_locked, matchups_locked, started")
    .eq("season_year", box.season_year)
    .eq("round", box.round)
    .single();
  if (!round?.course_locked || !round.matchups_locked || !round.started) {
    return NextResponse.json({ ok: false, error: "Arm the round before starting an individual match." }, { status: 400 });
  }

  const { error } = await service.from("live_match_boxes").update({ state: "Live", started: true, started_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "Could not start this match." }, { status: 500 });
  await service.from("live_score_audit_events").insert({ season_year: box.season_year, match_box_id: box.id, round: box.round, actor_profile_id: host.userId, kind: "match_started" });
  return NextResponse.json({ ok: true });
}
