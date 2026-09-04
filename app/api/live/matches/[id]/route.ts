import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Public read model for a live match. Leaderboard, Wagers, Broadcast, and
 * Player Portal can all consume this same official-state + latest-odds pair
 * instead of recalculating independent versions in the browser. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = createSupabaseServiceRoleClient();
  const [{ data: match }, { data: state }, { data: odds }] = await Promise.all([
    service.from("live_match_boxes").select("id, season_year, round, box_number, format, tee_time, maroon_players, white_players, state").eq("id", id).maybeSingle(),
    service.from("live_match_official_state").select("*").eq("match_box_id", id).maybeSingle(),
    service.from("live_match_odds_snapshots").select("*").eq("match_box_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!match) return NextResponse.json({ ok: false, error: "Match not found." }, { status: 404 });
  return NextResponse.json({ ok: true, match, officialState: state, odds }, { headers: { "Cache-Control": "no-store" } });
}
