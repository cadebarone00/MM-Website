import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { roundIsComplete, validateMatchBox } from "@/lib/live/orchestration";
import type { LiveMatchBox, LiveTournamentSnapshot, MatchFormat, MatchState, Team } from "@/lib/live/types";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, round, lock, value } = await request.json();
  if (!isValidSeasonYear(year) || typeof round !== "number" || (lock !== "course" && lock !== "matchups") || typeof value !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (lock === "course") {
    if (value) {
      const { data: current } = await service.from("live_round_state").select("date, course_id, format").eq("season_year", year).eq("round", round).single();
      if (!current?.date || !current?.course_id || !current?.format) {
        return NextResponse.json({ ok: false, error: "Set a date, course, and format before locking this round." }, { status: 400 });
      }
    }
    const { error } = await service
      .from("live_round_state")
      .update(value ? { course_locked: value } : { course_locked: value, matchups_locked: false })
      .eq("season_year", year)
      .eq("round", round);
    if (error) {
      return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // lock === "matchups"
  if (value) {
    const { data: current } = await service.from("live_round_state").select("course_locked, format, course_id, date").eq("season_year", year).eq("round", round).single();
    if (!current?.course_locked || !current.format) {
      return NextResponse.json({ ok: false, error: "Lock this round's course and format before locking matchups." }, { status: 400 });
    }

    const { data: boxRows } = await service
      .from("live_match_boxes")
      .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
      .eq("season_year", year)
      .eq("round", round);
    const matchBoxes: LiveMatchBox[] = (boxRows ?? []).map((row) => ({
      id: row.id,
      seasonYear: year,
      round: row.round,
      boxNumber: row.box_number,
      format: row.format as MatchFormat,
      teeTime: new Date(row.tee_time),
      maroonPlayers: row.maroon_players,
      whitePlayers: row.white_players,
      state: row.state as MatchState,
      started: row.started,
    }));
    const { data: rosterRows } = await service.from("live_roster").select("player_slug, team").eq("season_year", year);
    const players: LiveTournamentSnapshot["players"] = Object.fromEntries((rosterRows ?? []).map((r) => [r.player_slug, { team: r.team as Team }]));

    const snapshot: LiveTournamentSnapshot = { players, courses: {}, roundCourses: {}, scores: new Map(), matchBoxes };
    if (!roundIsComplete(snapshot, round, current.format as MatchFormat)) {
      return NextResponse.json({ ok: false, error: "Every match box for this round needs to be filled before locking matchups." }, { status: 400 });
    }

    const boxErrors = matchBoxes.flatMap((box) => validateMatchBox(snapshot, box).map((message) => `Match ${box.boxNumber}: ${message}`));
    if (boxErrors.length > 0) {
      return NextResponse.json({ ok: false, error: boxErrors.join(" ") }, { status: 400 });
    }

    const { data: course } = await service.from("live_courses").select("name, holes").eq("id", current.course_id).single();
    if (!course) return NextResponse.json({ ok: false, error: "The selected course could not be loaded." }, { status: 400 });
    const archiveRows = matchBoxes.flatMap((box) => {
      const entries = [[box.maroonPlayers, box.whitePlayers], [box.whitePlayers, box.maroonPlayers]] as const;
      return entries.flatMap(([side, opponents]) => side.map((playerSlug, index) => ({
        season_year: year, round, player_slug: playerSlug, course: course.name, played_on: current.date, format: box.format,
        match_box_id: box.id, partner_slug: side.length === 2 ? side[1 - index] : null, opponent_slugs: opponents,
        status: "scheduled", holes: course.holes,
      })));
    });
    const { error: archiveError } = await service.from("career_archive_rounds").upsert(archiveRows, { onConflict: "season_year,round,player_slug", ignoreDuplicates: true });
    if (archiveError) return NextResponse.json({ ok: false, error: "Could not create Career Archive rounds. Run the Career Live Archive SQL first." }, { status: 500 });
  }

  const { error } = await service.from("live_round_state").update({ matchups_locked: value }).eq("season_year", year).eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
