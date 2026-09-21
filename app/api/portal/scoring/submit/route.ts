import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";

/** Submit Round: all the rules live in the submit_live_round RPC so the check and the save are one transaction. */
export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });

  const { round } = await request.json();
  if (typeof round !== "number" || !Number.isInteger(round)) {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();
  const { data: boxRows } = await service
    .from("live_match_boxes")
    .select("id, maroon_players, white_players")
    .eq("season_year", seasonYear)
    .eq("round", round);
  const box = (boxRows ?? []).find((b) => (b.maroon_players as string[]).includes(player.playerSlug) || (b.white_players as string[]).includes(player.playerSlug));
  if (!box) return NextResponse.json({ ok: false, error: "You don't have a match box in this round." }, { status: 404 });

  const { data, error } = await service.rpc("submit_live_round", { p_box: box.id, p_player: player.playerSlug, p_actor: player.userId });
  if (error) {
    const rule = error.code === "P0001";
    if (!rule) console.error("Round submission failed:", error);
    return NextResponse.json({ ok: false, error: rule ? error.message : "Could not submit your round. Please try again." }, { status: rule ? 400 : 503 });
  }
  return NextResponse.json({ ok: true, ...data });
}
