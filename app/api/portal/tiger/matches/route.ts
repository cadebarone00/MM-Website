import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { validateMatchBox } from "@/lib/live/orchestration";
import { deriveMatchTeeTime, teeTimeSlotForMatch } from "@/lib/live/sessionTeeTimes";
import { syncLockedSessionToCareerArchive } from "@/lib/live/syncLockedRound";
import type { LiveMatch, LiveTournamentSnapshot, MatchFormat, MatchState, Team } from "@/lib/live/types";

interface MatchRow {
  id: string;
  round: number;
  box_number: number;
  format: string;
  tee_time: string;
  maroon_players: string[];
  white_players: string[];
  state: string;
  started: boolean;
}

function rowToMatch(row: MatchRow, seasonYear: number): LiveMatch {
  return {
    id: row.id,
    seasonYear,
    session: row.round,
    matchNumber: row.box_number,
    format: row.format as MatchFormat,
    teeTime: new Date(row.tee_time),
    maroonPlayers: row.maroon_players,
    whitePlayers: row.white_players,
    state: row.state as MatchState,
    started: row.started,
  };
}

const MATCH_COLUMNS = "id, round, box_number, format, tee_time, maroon_players, white_players, state, started";

export async function GET(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  if (!isValidSeasonYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }
  const sessionParam = url.searchParams.get("session");

  const service = createSupabaseServiceRoleClient();
  let query = service.from("live_match_boxes").select(MATCH_COLUMNS).eq("season_year", year).order("round").order("box_number");
  if (sessionParam) query = query.eq("round", Number(sessionParam));

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the matches." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matches: (data ?? []).map((row) => rowToMatch(row, year)) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, session, matchNumber, maroonPlayers, whitePlayers } = await request.json();
  if (
    !isValidSeasonYear(year) ||
    typeof session !== "number" ||
    typeof matchNumber !== "number" ||
    !Array.isArray(maroonPlayers) ||
    !Array.isArray(whitePlayers)
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: sessionRow } = await service.from("live_round_state").select("format, course_locked, matchups_locked, started, date, match_tee_times").eq("season_year", year).eq("round", session).single();
  if (!sessionRow?.course_locked || !sessionRow.format) {
    return NextResponse.json({ ok: false, error: "Lock this session's course and format before building matchups." }, { status: 400 });
  }
  if (sessionRow.started) {
    return NextResponse.json({ ok: false, error: "This session is armed; use Tiger's correction flow for a live matchup." }, { status: 400 });
  }
  const format = sessionRow.format as MatchFormat;

  const teeTimes = (sessionRow.match_tee_times as (string | null)[] | null) ?? [null, null, null];
  const slot = teeTimeSlotForMatch(format, matchNumber);
  const teeTime = deriveMatchTeeTime(sessionRow.date, teeTimes[slot] ?? null);
  if (!teeTime) {
    return NextResponse.json({ ok: false, error: "This session's tee times aren't set yet — set and lock them in Courses & Format first." }, { status: 400 });
  }

  const { data: rosterRows } = await service.from("live_roster").select("player_slug, team").eq("season_year", year);
  const players: LiveTournamentSnapshot["players"] = Object.fromEntries((rosterRows ?? []).map((r) => [r.player_slug, { team: r.team as Team }]));

  const { data: existingRows } = await service.from("live_match_boxes").select(MATCH_COLUMNS).eq("season_year", year).eq("round", session);
  const existingMatches = (existingRows as MatchRow[] | null ?? []).map((row) => rowToMatch(row, year)).filter((match) => match.matchNumber !== matchNumber);

  const candidate: LiveMatch = {
    id: null,
    seasonYear: year,
    session,
    matchNumber,
    format,
    teeTime,
    maroonPlayers,
    whitePlayers,
    state: "Scheduled",
    started: false,
  };

  const snapshot: LiveTournamentSnapshot = { players, courses: {}, roundCourses: {}, scores: new Map(), matchBoxes: [...existingMatches, candidate] };
  const errors = validateMatchBox(snapshot, candidate);
  if (errors.length > 0) {
    return NextResponse.json({ ok: false, error: errors.join(" ") }, { status: 400 });
  }

  const { data: currentMatch } = await service.from("live_match_boxes").select("id").eq("season_year", year).eq("round", session).eq("box_number", matchNumber).maybeSingle();
  if (currentMatch) {
    const { error } = await service
      .from("live_match_boxes")
      .update({ format, tee_time: teeTime.toISOString(), maroon_players: maroonPlayers, white_players: whitePlayers })
      .eq("id", currentMatch.id);
    if (error) return NextResponse.json({ ok: false, error: "Could not save that match." }, { status: 500 });
    if (sessionRow.matchups_locked) {
      try {
        await syncLockedSessionToCareerArchive(year, session);
      } catch {
        return NextResponse.json({ ok: false, error: "Match saved, but its published archive/odds update failed." }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true, id: currentMatch.id });
  }

  const { data: inserted, error } = await service
    .from("live_match_boxes")
    .insert({ season_year: year, round: session, box_number: matchNumber, format, tee_time: teeTime.toISOString(), maroon_players: maroonPlayers, white_players: whitePlayers })
    .select("id")
    .single();
  if (error || !inserted) {
    return NextResponse.json({ ok: false, error: "Could not save that match." }, { status: 500 });
  }
  if (sessionRow.matchups_locked) {
    try {
      await syncLockedSessionToCareerArchive(year, session);
    } catch {
      return NextResponse.json({ ok: false, error: "Match saved, but its published archive/odds update failed." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}
