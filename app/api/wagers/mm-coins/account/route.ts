import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const { data: account, error: accountError } = await supabase.rpc("ensure_wagers_account");
  if (accountError || !account) {
    return NextResponse.json({ ok: false, error: "Couldn't load your account." }, { status: 500 });
  }
  // ensure_wagers_account() returns a single composite row (not SETOF), so
  // PostgREST should hand back one object here rather than an array —
  // verify against the real project in this task's manual check and adapt
  // (e.g. `account[0]` instead of `account`) if the actual shape differs.
  const balance = Array.isArray(account) ? account[0]?.mm_coins_balance : account.mm_coins_balance;

  const { data: bets } = await supabase
    .from("mm_coin_bets")
    .select("id, market_key, selection_key, selection_label, odds, stake, potential_payout, status, placed_at")
    .eq("profile_id", user.id)
    .order("placed_at", { ascending: false });

  return NextResponse.json({
    ok: true,
    balance,
    wagers: (bets ?? []).map((b) => ({
      id: b.id,
      marketKey: b.market_key,
      selectionKey: b.selection_key,
      placedAt: b.placed_at,
      selectionLabel: b.selection_label,
      odds: b.odds,
      stake: b.stake,
      potentialPayout: b.potential_payout,
      status: b.status,
    })),
  });
}
