import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { liveMatchMarket, liveMatchMarketKey, type LiveOddsSnapshot } from "@/lib/wagers/liveMatchMarket";
import type { Market } from "@/lib/wagers/marketKeys";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { currentTeamWinnerState } from "@/lib/wagers/teamWinnerPricing";
import { teamWinnerMarketKey } from "@/lib/wagers/teamWinnerFuture";
import { currentLowIndividualState } from "@/lib/wagers/lowIndividualPricing";
import { lowIndividualMarketKey } from "@/lib/wagers/lowIndividualFuture";
import { currentHoleInOneState } from "@/lib/wagers/holeInOnePricing";
import { holeInOneMarketKey } from "@/lib/wagers/holeInOneFuture";
import { currentTotalBirdiesState } from "@/lib/wagers/totalBirdiesPricing";
import { totalBirdiesMarketKey } from "@/lib/wagers/totalBirdiesFuture";

const LIVE_MATCH_PREFIX = "live-match:";
const CLOSED = "That market isn't open for betting right now.";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Only markets with an automatic settlement path are accepted: the live
 * match winner (settled by Tiger's Close Out Match), and the Team Winner, Low
 * Individual, Hole in One and Total Birdies futures (settled when the last match closes
 * out — see supabase/*_future.sql).
 * Add a market type here only once its settlement is wired up. Odds always
 * come from the server's current price, never from the request. */
async function openMarket(supabase: Supabase, marketKey: string): Promise<{ market: Market | null; error: string }> {
  if (marketKey.startsWith(LIVE_MATCH_PREFIX)) {
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
    return { market, error: CLOSED };
  }

  const seasonYear = await getActiveSeasonYear();
  if (marketKey === teamWinnerMarketKey(seasonYear)) {
    const state = await currentTeamWinnerState(seasonYear);
    if (state.status === "updating") return { market: null, error: "Team Winner odds are updating after the latest score — try again in a moment." };
    return { market: state.status === "open" ? state.market : null, error: CLOSED };
  }
  if (marketKey === lowIndividualMarketKey(seasonYear)) {
    const state = await currentLowIndividualState(seasonYear);
    if (state.status === "updating") return { market: null, error: "Low Individual odds are updating after the latest score — try again in a moment." };
    return { market: state.status === "open" ? state.market : null, error: CLOSED };
  }
  if (marketKey === holeInOneMarketKey(seasonYear)) {
    const state = await currentHoleInOneState(seasonYear);
    return { market: state.status === "open" ? state.market : null, error: CLOSED };
  }
  if (marketKey === totalBirdiesMarketKey(seasonYear)) {
    // Selection keys carry the line ("over:41.5"), so a bet at a line that has
    // since moved finds no matching selection and is refused.
    const state = await currentTotalBirdiesState(seasonYear);
    if (state.status === "updating") return { market: null, error: "Total Birdies odds are updating after the latest score — try again in a moment." };
    return { market: state.status === "open" ? state.market : null, error: "The Total Birdies line has moved or closed — reopen the Futures tab for the current line." };
  }

  return { market: null, error: CLOSED };
}

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

  const { market, error: closedError } = await openMarket(supabase, marketKey);
  const selection = market?.selections.find((s) => s.key === selectionKey);
  if (!selection) {
    return NextResponse.json({ ok: false, error: closedError }, { status: 400 });
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
