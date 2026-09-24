import { retryPendingPublications } from "@/lib/live/retryPublication";
import { NextResponse } from "next/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Public list of real live-season matches and their latest official price. */
export async function GET() {
  const seasonYear = await getActiveSeasonYear();
  await retryPendingPublications(seasonYear);
  const service = createSupabaseServiceRoleClient();
  const { data: matches, error } = await service
    .from("live_match_boxes")
    .select("id, season_year, round, box_number, format, tee_time, maroon_players, white_players, state")
    .eq("season_year", seasonYear)
    .order("round")
    .order("box_number");
  if (error) return NextResponse.json({ ok: false, error: "Could not load live matches." }, { status: 500 });
  const ids = (matches ?? []).map((match) => match.id as string);
  const [{ data: states }, { data: odds }, { data: submissions }] = await Promise.all([
    ids.length ? service.from("live_match_official_state").select("*").in("match_box_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? service.from("live_match_odds_snapshots").select("*").in("match_box_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    ids.length ? service.from("live_match_box_submissions").select("match_box_id, player_slug").in("match_box_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const submittedById = new Map<string, string[]>();
  for (const row of submissions ?? []) submittedById.set(row.match_box_id as string, [...(submittedById.get(row.match_box_id as string) ?? []), row.player_slug as string]);
  const stateById = new Map((states ?? []).map((state) => [state.match_box_id as string, state]));
  const oddsById = new Map<string, unknown>();
  for (const snapshot of odds ?? []) if (!oddsById.has(snapshot.match_box_id as string)) oddsById.set(snapshot.match_box_id as string, snapshot);
  return NextResponse.json({ ok: true, matches: (matches ?? []).map((match) => ({ match, officialState: stateById.get(match.id as string) ?? null, odds: oddsById.get(match.id as string) ?? null, submittedPlayers: submittedById.get(match.id as string) ?? [] })) }, { headers: { "Cache-Control": "no-store" } });
}
