import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchLiveTournament } from "@/lib/data/fetchLiveTournament";
import { listAllMarkets } from "@/lib/wagers/marketKeys";
import { liveMatchMarket, liveMatchMarketKey, type LiveOddsSnapshot } from "@/lib/wagers/liveMatchMarket";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const { marketKey, selectionKey, stake } = await request.json();
  if (!marketKey || !selectionKey || typeof stake !== "number") {
    return NextResponse.json({ ok: false, error: "Malformed bet request." }, { status: 400 });
  }

  const tournament = await fetchLiveTournament();
  let market = listAllMarkets(tournament).find((m) => m.marketKey === marketKey);
  if (!market && typeof marketKey === "string" && marketKey.startsWith("live-match:")) {
    const matchBoxId = marketKey.slice("live-match:".length);
    const { data: match } = await supabase.from("live_match_boxes").select("id, maroon_players, white_players").eq("id", matchBoxId).maybeSingle();
    const { data: state } = await supabase.from("live_match_official_state").select("status").eq("match_box_id", matchBoxId).maybeSingle();
    const { data: odds } = await supabase.from("live_match_odds_snapshots").select("maroon_win_probability, tie_probability, white_win_probability, maroon_american_odds, tie_american_odds, white_american_odds").eq("match_box_id", matchBoxId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    // A match that is mathematically over is no longer a market. Tiger's
    // later Close Out action only audits the score and releases settlement;
    // it must never leave a window for a wager after the result is known.
    if (match && odds && state?.status !== "complete" && state?.status !== "closed_out" && marketKey === liveMatchMarketKey(match.id)) {
      market = liveMatchMarket(match, odds as LiveOddsSnapshot);
    }
  }
  const selection = market?.selections.find((s) => s.key === selectionKey);
  if (!selection) {
    return NextResponse.json({ ok: false, error: "That market isn't open for betting right now." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("place_mm_coin_bet", {
    p_market_key: marketKey,
    p_selection_key: selectionKey,
    p_selection_label: selection.label,
    p_odds: selection.odds,
    p_stake: stake,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, bet: data });
}
