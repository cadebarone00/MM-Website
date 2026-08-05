import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const { marketKey, selectionKey, label, odds, stake } = await request.json();
  if (!marketKey || !selectionKey || !label || typeof odds !== "number" || typeof stake !== "number") {
    return NextResponse.json({ ok: false, error: "Malformed bet request." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("place_mm_coin_bet", {
    p_market_key: marketKey,
    p_selection_key: selectionKey,
    p_selection_label: label,
    p_odds: odds,
    p_stake: stake,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, bet: data });
}
