import { retryPendingPublications } from "@/lib/live/retryPublication";
import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { matchProfileScorecard } from "@/lib/live/matchProfile";

/** Public read model for a live match. Leaderboard, Wagers, Broadcast, and
 * Player Portal can all consume this same official-state + latest-odds pair
 * instead of recalculating independent versions in the browser. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = createSupabaseServiceRoleClient();
  const { data: match } = await service.from("live_match_boxes").select("id, season_year, round, box_number, format, tee_time, maroon_players, white_players, state").eq("id", id).maybeSingle();
  if (!match) return NextResponse.json({ ok: false, error: "Match not found." }, { status: 404 });
  await retryPendingPublications(match.season_year, id);
  const [{ data: state }, { data: odds }] = await Promise.all([
    service.from("live_match_official_state").select("*").eq("match_box_id", id).maybeSingle(),
    service.from("live_match_odds_snapshots").select("*").eq("match_box_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!match) return NextResponse.json({ ok: false, error: "Match not found." }, { status: 404 });
  // The profile opts into the larger history and confirmed scorecard payload.
  if (new URL(request.url).searchParams.get("profile") === "1") {
    const [snapshot, history] = await Promise.all([
      buildLiveTournamentSnapshot(match.season_year, { confirmedOnly: true }),
      service.from("live_match_odds_snapshots")
        .select("state_thru, created_at, maroon_win_probability, tie_probability, white_win_probability, maroon_american_odds, tie_american_odds, white_american_odds")
        .eq("match_box_id", id).order("created_at", { ascending: false }).limit(1000),
    ]);
    if (history.error) return NextResponse.json({ ok: false, error: "Could not load match odds history." }, { status: 500 });
    const oddsHistory = (history.data ?? []).reverse();
    return NextResponse.json({ ok: true, match, officialState: state, odds: oddsHistory.at(-1) ?? odds, oddsHistory, scorecard: matchProfileScorecard(snapshot, id) }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true, match, officialState: state, odds }, { headers: { "Cache-Control": "no-store" } });
}
