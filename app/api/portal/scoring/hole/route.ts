import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { validHoleDraft } from "@/lib/live/holeSubmission";
import { publishOfficialMatchState } from "@/lib/live/publishOfficialMatchState";

export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid submission." }, { status: 400 }); }
  const round = body?.round;
  const hole = body?.hole;
  if (!body || !Number.isInteger(body.round) || body.round < 1 || !Number.isInteger(body.hole) || body.hole < 1 || body.hole > 18 || !validHoleDraft(body, 3, "Foursome")) {
    return NextResponse.json({ ok: false, error: "Enter both scores and a valid hole." }, { status: 400 });
  }
  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();
  // The RPC derives the opponent, validates stats against the locked course,
  // and saves both perspectives and archive changes in one transaction.
  const { data, error } = await service.rpc("submit_live_hole", {
    p_year: seasonYear, p_round: round, p_hole: hole, p_player: player.playerSlug, p_actor: player.userId,
    p_payload: { ownScore: body.ownScore, opponentScore: body.opponentScore, putts: body.putts ?? null, fairway: body.fairway ?? null, green: body.green ?? null },
  });
  if (error) {
    console.error("Hole submission failed:", error);
    return NextResponse.json({ ok: false, error: error.code === "P0001" ? error.message : "Scoring is temporarily unavailable. Your entries have not been submitted; please try again." }, { status: error.code === "P0001" ? 400 : 503 });
  }
  try { await publishOfficialMatchState(seasonYear, data.matchBoxId); }
  catch (err) { console.error("Official match refresh failed after hole submission:", err); }
  return NextResponse.json({ ok: true, submissions: data.submissions });
}
