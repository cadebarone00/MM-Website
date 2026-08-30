import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

interface MatchBoxRow {
  id: string;
  maroon_players: string[];
  white_players: string[];
}

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round, hole, putts, fir, gir } = await request.json();
  if (
    typeof round !== "number" ||
    typeof hole !== "number" ||
    hole < 1 ||
    hole > 18 ||
    typeof putts !== "number" ||
    putts < 0 ||
    (fir !== null && typeof fir !== "boolean") ||
    typeof gir !== "boolean"
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: boxRows } = await service.from("live_match_boxes").select("id, maroon_players, white_players").eq("round", round);
  const box = (boxRows as MatchBoxRow[] | null ?? []).find(
    (b) => b.maroon_players.includes(player.playerSlug) || b.white_players.includes(player.playerSlug)
  );
  if (!box) {
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

  const { data: roundRow } = await service.from("live_round_state").select("course_id").eq("round", round).single();
  let isPar3 = false;
  if (roundRow?.course_id) {
    const { data: course } = await service.from("live_courses").select("holes").eq("id", roundRow.course_id).single();
    const holeInfo = (course?.holes as { number: number; par: number }[] | undefined)?.find((h) => h.number === hole);
    isPar3 = holeInfo?.par === 3;
  }
  const normalizedFir = isPar3 ? null : fir;

  const { data: existingRow } = await service
    .from("live_hole_scores")
    .select("id")
    .eq("player_slug", player.playerSlug)
    .eq("round", round)
    .eq("hole", hole)
    .maybeSingle();
  if (existingRow) {
    const { error } = await service.from("live_hole_scores").update({ putts, fir: normalizedFir, gir }).eq("id", existingRow.id);
    if (error) return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 500 });
  } else {
    const { error } = await service.from("live_hole_scores").insert({ player_slug: player.playerSlug, round, hole, putts, fir: normalizedFir, gir });
    if (error) return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
