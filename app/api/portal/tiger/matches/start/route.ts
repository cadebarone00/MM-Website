import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Tiger's per-match tee-time override. The session must already be armed. */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });

  const { id } = await request.json();
  if (typeof id !== "string" || !id) return NextResponse.json({ ok: false, error: "Missing match." }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const { data: match } = await service.from("live_match_boxes").select("id, season_year, round, state").eq("id", id).single();
  if (!match) return NextResponse.json({ ok: false, error: "Match not found." }, { status: 404 });
  if (match.state === "Final") return NextResponse.json({ ok: false, error: "This match is already final." }, { status: 400 });

  const { data: session } = await service
    .from("live_round_state")
    .select("course_locked, matchups_locked, started")
    .eq("season_year", match.season_year)
    .eq("round", match.round)
    .single();
  if (!session?.course_locked || !session.matchups_locked || !session.started) {
    return NextResponse.json({ ok: false, error: "Arm the session before starting an individual match." }, { status: 400 });
  }

  const { error } = await service.from("live_match_boxes").update({ state: "Live", started: true, started_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: "Could not start this match." }, { status: 500 });
  await service.from("live_score_audit_events").insert({ season_year: match.season_year, match_box_id: match.id, round: match.round, actor_profile_id: host.userId, kind: "match_started" });
  return NextResponse.json({ ok: true });
}
