import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchLiveTournament } from "@/lib/data/fetchLiveTournament";
import { listAllMarkets } from "@/lib/wagers/marketKeys";

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
  const market = listAllMarkets(tournament).find((m) => m.marketKey === marketKey);
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
