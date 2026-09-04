import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { DEFAULT_REAL_SEASON_YEAR, TEST_SEASON_YEAR } from "@/lib/live/testSeason";

type TestBet = {
  profile_id: string;
  stake: number;
  potential_payout: number;
  status: "pending" | "won" | "lost";
};

/** Deletes the disposable 2034 rehearsal without touching historical or real
 * tournament data. Test wager account effects are reversed before the bets
 * themselves are removed, so this cannot change a player's real MM balance. */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (body?.confirmation !== "RESET TEST SEASON") {
    return NextResponse.json({ ok: false, error: "Confirmation text did not match." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: boxes, error: boxesError } = await service
    .from("live_match_boxes")
    .select("id")
    .eq("season_year", TEST_SEASON_YEAR);
  if (boxesError) return NextResponse.json({ ok: false, error: boxesError.message }, { status: 500 });

  const marketKeys = (boxes ?? []).map((box) => `live-match:${box.id}`);
  let wagerCount = 0;
  if (marketKeys.length) {
    const { data: bets, error: betsError } = await service
      .from("mm_coin_bets")
      .select("profile_id, stake, potential_payout, status")
      .in("market_key", marketKeys);
    if (betsError) return NextResponse.json({ ok: false, error: betsError.message }, { status: 500 });
    wagerCount = bets?.length ?? 0;

    // Reverse test-only wallet changes: every test stake is restored; a
    // previously credited winning payout is removed as part of the reversal.
    const balanceDelta = new Map<string, number>();
    for (const bet of (bets ?? []) as TestBet[]) {
      const delta = Number(bet.stake) - (bet.status === "won" ? Number(bet.potential_payout) : 0);
      balanceDelta.set(bet.profile_id, (balanceDelta.get(bet.profile_id) ?? 0) + delta);
    }
    for (const [profileId, delta] of balanceDelta) {
      const { data: account, error: accountError } = await service
        .from("wagers_accounts")
        .select("mm_coins_balance")
        .eq("profile_id", profileId)
        .maybeSingle();
      if (accountError) return NextResponse.json({ ok: false, error: accountError.message }, { status: 500 });
      if (account) {
        const { error } = await service
          .from("wagers_accounts")
          .update({ mm_coins_balance: Number(account.mm_coins_balance) + delta })
          .eq("profile_id", profileId);
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
    }

    const { error: settlementsError } = await service.from("wagers_market_settlements").delete().in("market_key", marketKeys);
    if (settlementsError) return NextResponse.json({ ok: false, error: settlementsError.message }, { status: 500 });
    const { error: deleteBetsError } = await service.from("mm_coin_bets").delete().in("market_key", marketKeys);
    if (deleteBetsError) return NextResponse.json({ ok: false, error: deleteBetsError.message }, { status: 500 });
  }

  // Child rows and archive data first. Foreign-key cascades handle match
  // official state, odds snapshots, audit events, and submissions.
  const deletions = [
    service.from("career_archive_team_holes").delete().eq("season_year", TEST_SEASON_YEAR),
    service.from("career_archive_rounds").delete().eq("season_year", TEST_SEASON_YEAR),
    service.from("live_hole_scores").delete().eq("season_year", TEST_SEASON_YEAR),
    service.from("live_match_boxes").delete().eq("season_year", TEST_SEASON_YEAR),
    service.from("live_round_state").delete().eq("season_year", TEST_SEASON_YEAR),
    service.from("live_roster").delete().eq("season_year", TEST_SEASON_YEAR),
    service.from("live_tournament_settings").delete().eq("season_year", TEST_SEASON_YEAR),
    service.from("broadcast_config").delete().eq("season_year", TEST_SEASON_YEAR),
    service.from("broadcast_state").delete().eq("season_year", TEST_SEASON_YEAR),
  ];
  const results = await Promise.all(deletions);
  const failed = results.find((result) => result.error);
  if (failed?.error) return NextResponse.json({ ok: false, error: failed.error.message }, { status: 500 });

  const { error: activeError } = await service
    .from("live_active_season")
    .update({ season_year: DEFAULT_REAL_SEASON_YEAR })
    .eq("id", true);
  if (activeError) return NextResponse.json({ ok: false, error: activeError.message }, { status: 500 });

  return NextResponse.json({ ok: true, removedMatchCount: boxes?.length ?? 0, reversedWagerCount: wagerCount });
}
