import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { canScoreStrokesFor, scoresAgree } from "@/lib/live/orchestration";
import type { LiveMatchBox, MatchFormat, MatchState } from "@/lib/live/types";

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

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round, hole, targetPlayerSlugs, score } = await request.json();
  if (
    typeof round !== "number" ||
    !Number.isInteger(round) ||
    typeof hole !== "number" ||
    !Number.isInteger(hole) ||
    hole < 1 ||
    hole > 18 ||
    !Array.isArray(targetPlayerSlugs) ||
    targetPlayerSlugs.some((s: unknown) => typeof s !== "string") ||
    typeof score !== "number" ||
    !Number.isInteger(score) ||
    score < 1
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();

  const { data: boxRow } = await service
    .from("live_match_boxes")
    .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
    .eq("season_year", seasonYear)
    .eq("round", round);
  const box = (boxRow as MatchBoxRow[] | null ?? [])
    .map((row) => rowToMatchBox(row, seasonYear))
    .find((b) => b.maroonPlayers.includes(player.playerSlug) || b.whitePlayers.includes(player.playerSlug));
  if (!box || !box.id) {
    return NextResponse.json({ ok: false, error: "You don't have a match box in this round." }, { status: 404 });
  }

  const { data: roundState } = await service
    .from("live_round_state")
    .select("course_locked, matchups_locked, started")
    .eq("season_year", seasonYear)
    .eq("round", round)
    .single();
  if (!roundState?.course_locked || !roundState?.matchups_locked || !roundState?.started) {
    return NextResponse.json({ ok: false, error: "This round isn't live yet." }, { status: 400 });
  }

  const { data: existingSubmission } = await service
    .from("live_match_box_submissions")
    .select("player_slug")
    .eq("match_box_id", box.id)
    .eq("player_slug", player.playerSlug)
    .maybeSingle();
  if (existingSubmission) {
    return NextResponse.json({ ok: false, error: "You've already submitted your scores for this round." }, { status: 400 });
  }

  if (!canScoreStrokesFor(box, player.playerSlug, targetPlayerSlugs)) {
    return NextResponse.json({ ok: false, error: "You're not the assigned scorer for that player." }, { status: 403 });
  }

  for (const target of targetPlayerSlugs as string[]) {
    const { data: existingRow } = await service
      .from("live_hole_scores")
      .select("id, self_reported_score")
      .eq("season_year", seasonYear)
      .eq("player_slug", target)
      .eq("round", round)
      .eq("hole", hole)
      .maybeSingle();
    const confirmedBy = scoresAgree(score, existingRow?.self_reported_score ?? null) ? target : null;
    if (existingRow) {
      const { error } = await service.from("live_hole_scores").update({ score, confirmed_by: confirmedBy }).eq("id", existingRow.id);
      if (error) return NextResponse.json({ ok: false, error: "Could not save that score." }, { status: 500 });
    } else {
      const { error } = await service
        .from("live_hole_scores")
        .insert({ season_year: seasonYear, player_slug: target, round, hole, score, confirmed_by: confirmedBy });
      if (error) return NextResponse.json({ ok: false, error: "Could not save that score." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
