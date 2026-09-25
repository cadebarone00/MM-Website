import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { sessionIsComplete, validateMatchBox } from "@/lib/live/orchestration";
import { deriveMatchTeeTime, teeTimeSlotForMatch } from "@/lib/live/sessionTeeTimes";
import { syncLockedSessionToCareerArchive } from "@/lib/live/syncLockedRound";
import { availableTeeSets } from "@/lib/live/teeSets";
import type { LiveMatch, LiveTournamentSnapshot, MatchFormat, MatchState, Team } from "@/lib/live/types";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, session, lock, value } = await request.json();
  if (!isValidSeasonYear(year) || typeof session !== "number" || (lock !== "course" && lock !== "matchups") || typeof value !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (lock === "course") {
    if (value) {
      const { data: current } = await service.from("live_round_state").select("date, course_id, format, course_setup, match_tee_times").eq("season_year", year).eq("round", session).single();
      if (!current) return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
      const teeTimes = (current.match_tee_times as (string | null)[] | null) ?? [null, null, null];
      if (current.course_setup) {
        const { data: course } = await service.from("live_courses").select("tee_sets").eq("id", current.course_id).single();
        const availableIds = new Set(availableTeeSets(Array.isArray(course?.tee_sets) ? course.tee_sets : []).map((tee) => tee.id));
        if (!availableIds.has(current.course_setup?.teeSetId) || Object.values(current.course_setup?.holeTeeSetIds ?? {}).some((id) => typeof id !== "string" || !availableIds.has(id))) {
          return NextResponse.json({ ok: false, error: "Choose locked tee sets from the Course Library before locking this session." }, { status: 400 });
        }
      }

      // Locking is the single point where this session's tee times become
      // authoritative. Matches created earlier derived their own tee_time from
      // whatever the slots held at creation time, so if Tiger unlocked the
      // course, edited a slot, and re-locked, those stored instants are stale —
      // and tee_time (not the session's slots) is what drives the automatic
      // Scheduled -> Armed -> Live transition. Re-derive every existing match.
      const { data: existingMatches, error: existingError } = await service
        .from("live_match_boxes")
        .select("id, box_number, format, tee_time")
        .eq("season_year", year)
        .eq("round", session);
      if (existingError) {
        return NextResponse.json({ ok: false, error: "Could not re-check this session's match tee times." }, { status: 500 });
      }
      const { data: seasonSettings } = await service.from("live_tournament_settings").select("timezone").eq("season_year", year).maybeSingle();
      for (const match of existingMatches ?? []) {
        const slot = teeTimeSlotForMatch(match.format as MatchFormat, match.box_number);
        const derived = deriveMatchTeeTime(current.date, teeTimes[slot] ?? null, seasonSettings?.timezone ?? "America/Los_Angeles");
        if (!derived) continue;
        if (match.tee_time && new Date(match.tee_time).getTime() === derived.getTime()) continue;
        const { error: teeTimeError } = await service
          .from("live_match_boxes")
          .update({ tee_time: derived.toISOString() })
          .eq("id", match.id);
        if (teeTimeError) {
          return NextResponse.json({ ok: false, error: "Could not update this session's match tee times." }, { status: 500 });
        }
      }
    }
    const { error } = await service
      .from("live_round_state")
      .update(value ? { course_locked: value } : { course_locked: value, matchups_locked: false })
      .eq("season_year", year)
      .eq("round", session);
    if (error) {
      return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // lock === "matchups"
  if (value) {
    const { data: current } = await service.from("live_round_state").select("course_locked, format, course_id, date, course_setup, match_tee_times").eq("season_year", year).eq("round", session).single();
    if (!current?.course_locked || !current.format) {
      return NextResponse.json({ ok: false, error: "Lock this session's course and format before locking matchups." }, { status: 400 });
    }

    if (!current.course_id || !current.date || !current.course_setup || !Array.isArray(current.match_tee_times) || current.match_tee_times.length !== 3 || current.match_tee_times.some((time: string | null) => !time)) {
      return NextResponse.json({ ok: false, error: "Complete the course, date, tee setup and tee times before locking matchups. The session itself can stay partially locked." }, { status: 400 });
    }

    const { data: matchRows } = await service
      .from("live_match_boxes")
      .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
      .eq("season_year", year)
      .eq("round", session);
    const matches: LiveMatch[] = (matchRows ?? []).map((row) => ({
      id: row.id,
      seasonYear: year,
      session: row.round,
      matchNumber: row.box_number,
      format: row.format as MatchFormat,
      teeTime: new Date(row.tee_time),
      maroonPlayers: row.maroon_players,
      whitePlayers: row.white_players,
      state: row.state as MatchState,
      started: row.started,
    }));
    const { data: rosterRows } = await service.from("live_roster").select("player_slug, team").eq("season_year", year);
    const players: LiveTournamentSnapshot["players"] = Object.fromEntries((rosterRows ?? []).map((r) => [r.player_slug, { team: r.team as Team }]));

    const snapshot: LiveTournamentSnapshot = { players, courses: {}, roundCourses: {}, scores: new Map(), matchBoxes: matches };
    if (!sessionIsComplete(snapshot, session, current.format as MatchFormat)) {
      return NextResponse.json({ ok: false, error: "Every match for this session needs to be filled before locking matchups." }, { status: 400 });
    }

    const matchErrors = matches.flatMap((match) => validateMatchBox(snapshot, match).map((message) => `Match ${match.matchNumber}: ${message}`));
    if (matchErrors.length > 0) {
      return NextResponse.json({ ok: false, error: matchErrors.join(" ") }, { status: 400 });
    }
  }

  const { error } = await service.from("live_round_state").update({ matchups_locked: value }).eq("season_year", year).eq("round", session);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
  }
  if (value) {
    try {
      await syncLockedSessionToCareerArchive(year, session);
    } catch {
      return NextResponse.json({ ok: false, error: "Matchups locked, but Career Archive publishing failed. Run the Career Live Archive SQL first." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
