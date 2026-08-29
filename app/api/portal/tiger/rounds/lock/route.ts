import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { roundIsComplete } from "@/lib/live/orchestration";
import type { LiveMatchBox, LiveTournamentSnapshot, MatchFormat, MatchState } from "@/lib/live/types";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round, lock, value } = await request.json();
  if (typeof round !== "number" || (lock !== "course" && lock !== "matchups") || typeof value !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (lock === "course") {
    if (value) {
      const { data: current } = await service.from("live_round_state").select("date, course_id, format").eq("round", round).single();
      if (!current?.date || !current?.course_id || !current?.format) {
        return NextResponse.json({ ok: false, error: "Set a date, course, and format before locking this round." }, { status: 400 });
      }
    }
    // Unlocking course/format invalidates any matchups built against it —
    // a matchups-locked round can't be left pointing at an unlocked format.
    const { error } = await service
      .from("live_round_state")
      .update(value ? { course_locked: value } : { course_locked: value, matchups_locked: false })
      .eq("round", round);
    if (error) {
      return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // lock === "matchups"
  if (value) {
    const { data: current } = await service.from("live_round_state").select("course_locked, format").eq("round", round).single();
    if (!current?.course_locked || !current.format) {
      return NextResponse.json({ ok: false, error: "Lock this round's course and format before locking matchups." }, { status: 400 });
    }

    const { data: boxRows } = await service
      .from("live_match_boxes")
      .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
      .eq("round", round);
    const matchBoxes: LiveMatchBox[] = (boxRows ?? []).map((row) => ({
      id: row.id,
      round: row.round,
      boxNumber: row.box_number,
      format: row.format as MatchFormat,
      teeTime: new Date(row.tee_time),
      maroonPlayers: row.maroon_players,
      whitePlayers: row.white_players,
      state: row.state as MatchState,
      started: row.started,
    }));
    const snapshot: LiveTournamentSnapshot = { players: {}, courses: {}, roundCourses: {}, scores: new Map(), matchBoxes };
    if (!roundIsComplete(snapshot, round, current.format as MatchFormat)) {
      return NextResponse.json({ ok: false, error: "Every match box for this round needs to be filled before locking matchups." }, { status: 400 });
    }
  }

  const { error } = await service.from("live_round_state").update({ matchups_locked: value }).eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
