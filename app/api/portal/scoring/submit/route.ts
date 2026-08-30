import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { canScoreStrokesFor } from "@/lib/live/orchestration";
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

function rowToMatchBox(row: MatchBoxRow): LiveMatchBox {
  return {
    id: row.id,
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

  const { round } = await request.json();
  if (typeof round !== "number") {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: boxRows } = await service
    .from("live_match_boxes")
    .select("id, round, box_number, format, tee_time, maroon_players, white_players, state, started")
    .eq("round", round);
  const box = (boxRows as MatchBoxRow[] | null ?? [])
    .map(rowToMatchBox)
    .find((b) => b.maroonPlayers.includes(player.playerSlug) || b.whitePlayers.includes(player.playerSlug));
  if (!box || !box.id) {
    return NextResponse.json({ ok: false, error: "You don't have a match box in this round." }, { status: 404 });
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

  // Figure out exactly which players' strokes this caller is responsible
  // for, by asking canScoreStrokesFor about every plausible target set —
  // simplest correct way to invert "who can I score" into "who must I score"
  // without duplicating the format-specific pairing rule a second time.
  const everyone = [...box.maroonPlayers, ...box.whitePlayers];
  const responsibleFor = everyone.filter((candidate) => canScoreStrokesFor(box, player.playerSlug, [candidate]))
    .concat(canScoreStrokesFor(box, player.playerSlug, box.maroonPlayers) ? box.maroonPlayers : [])
    .concat(canScoreStrokesFor(box, player.playerSlug, box.whitePlayers) ? box.whitePlayers : []);
  const uniqueResponsibleFor = [...new Set(responsibleFor)];

  const { data: scoreRows } = await service
    .from("live_hole_scores")
    .select("player_slug, hole, score, putts, fir, gir")
    .eq("round", round)
    .in("player_slug", everyone);
  const rows = scoreRows ?? [];

  const { data: roundRow } = await service.from("live_round_state").select("course_id").eq("round", round).single();
  const { data: course } = roundRow?.course_id
    ? await service.from("live_courses").select("holes").eq("id", roundRow.course_id).single()
    : { data: null };
  const holes = (course?.holes as { number: number; par: number }[] | undefined) ?? [];

  for (let hole = 1; hole <= 18; hole++) {
    for (const target of uniqueResponsibleFor) {
      const row = rows.find((r) => r.player_slug === target && r.hole === hole);
      if (!row || row.score === null || row.score <= 0) {
        return NextResponse.json({ ok: false, error: `Finish entering all 18 holes before submitting (missing hole ${hole}).` }, { status: 400 });
      }
    }
    const ownRow = rows.find((r) => r.player_slug === player.playerSlug && r.hole === hole);
    const isPar3 = holes.find((h) => h.number === hole)?.par === 3;
    if (!ownRow || ownRow.putts === null || ownRow.gir === null || (!isPar3 && ownRow.fir === null)) {
      return NextResponse.json({ ok: false, error: `Finish entering your own stats for all 18 holes before submitting (missing hole ${hole}).` }, { status: 400 });
    }
  }

  const { error } = await service.from("live_match_box_submissions").insert({ match_box_id: box.id, player_slug: player.playerSlug });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not submit your scores." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
