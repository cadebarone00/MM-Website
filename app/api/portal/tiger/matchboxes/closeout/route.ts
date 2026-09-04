import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { liveMatchMarketKey } from "@/lib/wagers/liveMatchMarket";

/**
 * Tiger's final accounting checkpoint. Live confirmation has already updated
 * standings/odds; this endpoint freezes an established result so wager
 * settlement can be authorized by the next, market-binding slice.
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });

  const { id } = await request.json();
  if (typeof id !== "string" || !id) return NextResponse.json({ ok: false, error: "Missing match box." }, { status: 400 });

  const service = createSupabaseServiceRoleClient();
  const { data: box } = await service
    .from("live_match_boxes")
    .select("id, season_year, round, maroon_players, white_players")
    .eq("id", id)
    .single();
  if (!box) return NextResponse.json({ ok: false, error: "Match box not found." }, { status: 404 });

  const [{ data: official }, { data: submissions }] = await Promise.all([
    service.from("live_match_official_state").select("status, mathematically_complete, official_result, closed_out_at").eq("match_box_id", id).maybeSingle(),
    service.from("live_match_box_submissions").select("player_slug").eq("match_box_id", id),
  ]);
  if (!official?.mathematically_complete || !official.official_result) {
    return NextResponse.json({ ok: false, error: "This match has not reached a confirmed final result yet." }, { status: 400 });
  }
  if (official.closed_out_at) return NextResponse.json({ ok: false, error: "This match has already been closed out." }, { status: 400 });

  const requiredPlayers = [...box.maroon_players, ...box.white_players] as string[];
  const submitted = new Set((submissions ?? []).map((row) => row.player_slug as string));
  const missing = requiredPlayers.filter((player) => !submitted.has(player));
  if (missing.length > 0) {
    return NextResponse.json({ ok: false, error: `Waiting for score submission from: ${missing.join(", ")}.` }, { status: 400 });
  }

  const now = new Date().toISOString();
  const [{ error: officialError }, { error: boxError }, { error: archiveError }] = await Promise.all([
    service.from("live_match_official_state").update({ status: "closed_out", closed_out_at: now, closed_out_by: host.userId, updated_at: now }).eq("match_box_id", id),
    service.from("live_match_boxes").update({ state: "Final" }).eq("id", id),
    service.from("career_archive_rounds").update({ status: "final", updated_at: now }).eq("season_year", box.season_year).eq("round", box.round).eq("match_box_id", id),
  ]);
  if (officialError || boxError || archiveError) return NextResponse.json({ ok: false, error: "Could not close out this match." }, { status: 500 });

  await service.from("live_score_audit_events").insert({
    season_year: box.season_year,
    match_box_id: id,
    round: box.round,
    actor_profile_id: host.userId,
    kind: "match_closed_out",
    payload: { result: official.official_result },
  });
  // The only automatic settlement path: Close Out Match has passed all
  // player-submission and confirmed-result checks above.
  const sessionClient = await createSupabaseServerClient();
  const { error: settlementError } = await sessionClient.rpc("settle_mm_coin_market", {
    p_market_key: liveMatchMarketKey(id),
    p_winning_selection_key: official.official_result,
  });
  // No wagers is normal; the settlement function still creates a harmless
  // market settlement. Any other error is logged for Tiger but never undoes
  // the already-approved match closeout.
  if (settlementError) console.error("live match wager settlement failed:", settlementError.message);
  return NextResponse.json({ ok: true, result: official.official_result });
}
