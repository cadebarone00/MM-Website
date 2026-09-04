import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import type { MatchFormat, MatchState } from "@/lib/live/types";

interface MatchBoxRow {
  id: string;
  box_number: number;
  format: string;
  tee_time: string;
  maroon_players: string[];
  white_players: string[];
  state: string;
  started: boolean;
}

interface HoleScoreRow {
  player_slug: string;
  hole: number;
  score: number | null;
  putts: number | null;
  fir: boolean | null;
  gir: boolean | null;
  did_not_finish: boolean;
  self_reported_score: number | null;
  confirmed_by: string | null;
}

export async function GET(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const round = Number(url.searchParams.get("round"));
  if (!Number.isInteger(round)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid round." }, { status: 400 });
  }

  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();

  const { data: boxRows } = await service
    .from("live_match_boxes")
    .select("id, box_number, format, tee_time, maroon_players, white_players, state, started")
    .eq("season_year", seasonYear)
    .eq("round", round);
  const box = (boxRows as MatchBoxRow[] | null ?? []).find(
    (b) => b.maroon_players.includes(player.playerSlug) || b.white_players.includes(player.playerSlug)
  );
  if (!box) {
    return NextResponse.json({ ok: false, error: "You don't have a match box in this round." }, { status: 404 });
  }

  const allPlayers = [...box.maroon_players, ...box.white_players];
  const [{ data: scoreRows }, { data: submissionRows }] = await Promise.all([
    service
      .from("live_hole_scores")
      .select("player_slug, hole, score, putts, fir, gir, did_not_finish, self_reported_score, confirmed_by")
      .eq("season_year", seasonYear)
      .eq("round", round)
      .in("player_slug", allPlayers),
    service.from("live_match_box_submissions").select("player_slug").eq("match_box_id", box.id),
  ]);

  return NextResponse.json(
    {
      ok: true,
      matchBox: {
        id: box.id,
        boxNumber: box.box_number,
        format: box.format as MatchFormat,
        teeTime: box.tee_time,
        maroonPlayers: box.maroon_players,
        whitePlayers: box.white_players,
        state: box.state as MatchState,
      },
      scores: (scoreRows as HoleScoreRow[] | null ?? []).map((r) => ({
        player: r.player_slug,
        hole: r.hole,
        score: r.score,
        putts: r.putts,
        fir: r.fir,
        gir: r.gir,
        didNotFinish: r.did_not_finish,
        selfReportedScore: r.self_reported_score,
        confirmedBy: r.confirmed_by,
      })),
      submittedPlayers: (submissionRows ?? []).map((r) => r.player_slug as string),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
