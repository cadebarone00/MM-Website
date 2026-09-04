import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { validateMatchBox } from "@/lib/live/orchestration";
import { syncLockedRoundToCareerArchive } from "@/lib/live/syncLockedRound";
import type { LiveMatchBox, LiveTournamentSnapshot, MatchFormat, MatchState, Team } from "@/lib/live/types";

interface MatchBoxRow {
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

function rowToMatchBox(row: MatchBoxRow, seasonYear: number): LiveMatchBox {
  return {
    id: row.id,
    seasonYear,
    round: row.round,
    boxNumber: row.box_number,
    format: row.format as MatchFormat,
    teeTime: new Date(row.tee_time),
    maroonPlayers: row.maroon_players,
    whitePlayers: row.white_players,
    state: row.state as MatchState,
    started: row.started,
  };
}

const MATCH_BOX_COLUMNS = "id, round, box_number, format, tee_time, maroon_players, white_players, state, started";

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
  const roundParam = url.searchParams.get("round");

  const service = createSupabaseServiceRoleClient();
  let query = service.from("live_match_boxes").select(MATCH_BOX_COLUMNS).eq("season_year", year).order("round").order("box_number");
  if (roundParam) query = query.eq("round", Number(roundParam));

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load the match boxes." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matchBoxes: (data ?? []).map((row) => rowToMatchBox(row, year)) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, round, boxNumber, teeTime, maroonPlayers, whitePlayers } = await request.json();
  if (
    !isValidSeasonYear(year) ||
    typeof round !== "number" ||
    typeof boxNumber !== "number" ||
    typeof teeTime !== "string" ||
    !Array.isArray(maroonPlayers) ||
    !Array.isArray(whitePlayers)
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: roundRow } = await service.from("live_round_state").select("format, course_locked, matchups_locked, started").eq("season_year", year).eq("round", round).single();
  if (!roundRow?.course_locked || !roundRow.format) {
    return NextResponse.json({ ok: false, error: "Lock this round's course and format before building matchups." }, { status: 400 });
  }
  if (roundRow.started) {
    return NextResponse.json({ ok: false, error: "This round is armed; use Tiger's correction flow for a live matchup." }, { status: 400 });
  }
  const format = roundRow.format as MatchFormat;

  const { data: rosterRows } = await service.from("live_roster").select("player_slug, team").eq("season_year", year);
  const players: LiveTournamentSnapshot["players"] = Object.fromEntries((rosterRows ?? []).map((r) => [r.player_slug, { team: r.team as Team }]));

  const { data: existingRows } = await service.from("live_match_boxes").select(MATCH_BOX_COLUMNS).eq("season_year", year).eq("round", round);
  const existingBoxes = (existingRows as MatchBoxRow[] | null ?? []).map((row) => rowToMatchBox(row, year)).filter((box) => box.boxNumber !== boxNumber);

  const candidate: LiveMatchBox = {
    id: null,
    seasonYear: year,
    round,
    boxNumber,
    format,
    teeTime: new Date(teeTime),
    maroonPlayers,
    whitePlayers,
    state: "Scheduled",
    started: false,
  };

  const snapshot: LiveTournamentSnapshot = { players, courses: {}, roundCourses: {}, scores: new Map(), matchBoxes: [...existingBoxes, candidate] };
  const errors = validateMatchBox(snapshot, candidate);
  if (errors.length > 0) {
    return NextResponse.json({ ok: false, error: errors.join(" ") }, { status: 400 });
  }

  const { data: currentBox } = await service.from("live_match_boxes").select("id").eq("season_year", year).eq("round", round).eq("box_number", boxNumber).maybeSingle();
  if (currentBox) {
    const { error } = await service
      .from("live_match_boxes")
      .update({ format, tee_time: teeTime, maroon_players: maroonPlayers, white_players: whitePlayers })
      .eq("id", currentBox.id);
    if (error) return NextResponse.json({ ok: false, error: "Could not save that match box." }, { status: 500 });
    if (roundRow.matchups_locked) {
      try {
        await syncLockedRoundToCareerArchive(year, round);
      } catch {
        return NextResponse.json({ ok: false, error: "Match saved, but its published archive/odds update failed." }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true, id: currentBox.id });
  }

  const { data: inserted, error } = await service
    .from("live_match_boxes")
    .insert({ season_year: year, round, box_number: boxNumber, format, tee_time: teeTime, maroon_players: maroonPlayers, white_players: whitePlayers })
    .select("id")
    .single();
  if (error || !inserted) {
    return NextResponse.json({ ok: false, error: "Could not save that match box." }, { status: 500 });
  }
  if (roundRow.matchups_locked) {
    try {
      await syncLockedRoundToCareerArchive(year, round);
    } catch {
      return NextResponse.json({ ok: false, error: "Match saved, but its published archive/odds update failed." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}
