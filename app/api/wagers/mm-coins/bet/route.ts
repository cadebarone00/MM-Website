import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { liveMatchMarket, liveMatchMarketKey, type LiveOddsSnapshot } from "@/lib/wagers/liveMatchMarket";

const LIVE_MATCH_PREFIX = "live-match:";

/** Only markets with an automatic settlement path are accepted. Today that is
 * the live match winner market, which Tiger's Close Out Match settles. Mock
 * futures/props markets were removed because nothing could ever settle them,
 * leaving stakes stuck in "pending". Add a market type here only once its
 * settlement is wired up. */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const { marketKey, selectionKey, stake } = await request.json();
  if (typeof marketKey !== "string" || !selectionKey || typeof stake !== "number") {
    return NextResponse.json({ ok: false, error: "Malformed bet request." }, { status: 400 });
  }

  if (!marketKey.startsWith(LIVE_MATCH_PREFIX)) {
    return NextResponse.json({ ok: false, error: "That market isn't open for betting right now." }, { status: 400 });
  }

  const matchBoxId = marketKey.slice(LIVE_MATCH_PREFIX.length);
  const [{ data: match }, { data: state }, { data: odds }] = await Promise.all([
    supabase.from("live_match_boxes").select("id, maroon_players, white_players").eq("id", matchBoxId).maybeSingle(),
    supabase.from("live_match_official_state").select("status").eq("match_box_id", matchBoxId).maybeSingle(),
    supabase.from("live_match_odds_snapshots").select("maroon_win_probability, tie_probability, white_win_probability, maroon_american_odds, tie_american_odds, white_american_odds").eq("match_box_id", matchBoxId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  // A match that is mathematically over is no longer a market. Tiger's
  // later Close Out action only audits the score and releases settlement;
  // it must never leave a window for a wager after the result is known.
  const closed = state?.status === "complete" || state?.status === "closed_out";
  const market = match && odds && !closed && marketKey === liveMatchMarketKey(match.id) ? liveMatchMarket(match, odds as LiveOddsSnapshot) : null;
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
