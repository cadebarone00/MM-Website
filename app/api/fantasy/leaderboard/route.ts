import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { fetchLiveTournament } from "@/lib/data/fetchLiveTournament";
import { fantasyTeamScore, type FantasyPicks } from "@/lib/fantasy/scoring";
import { rankEntries } from "@/lib/fantasy/ranking";

/**
 * Everyone who's drafted a fantasy team for the current tournament, ranked
 * by total points — a service-role read (fantasy_teams and profiles are
 * both scoped to their own row for the normal cookie client) resolved
 * against the real display name on each profile, scored with the same
 * fantasyTeamScore every other Fantasy view already uses.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const tournament = await fetchLiveTournament();
  const service = createSupabaseServiceRoleClient();

  const { data: rows, error } = await service
    .from("fantasy_teams")
    .select("profile_id, maroon_player, white_player, wildcard_player")
    .eq("tournament_slug", tournament.slug);

  if (error) {
    return NextResponse.json({ ok: false, error: "Couldn't load the leaderboard." }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, standings: [] });
  }

  const { data: profiles } = await service
    .from("profiles")
    .select("id, display_name")
    .in("id", rows.map((row) => row.profile_id));
  const nameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name as string]));

  const entries = rows.map((row) => {
    const picks: FantasyPicks = { maroonPlayer: row.maroon_player, whitePlayer: row.white_player, wildcardPlayer: row.wildcard_player };
    return {
      profileId: row.profile_id as string,
      displayName: nameById.get(row.profile_id) ?? "Player",
      total: fantasyTeamScore(tournament, picks).total,
    };
  });

  const standings = rankEntries(entries, (entry) => entry.total).map(({ rank, rankLabel, entry }) => ({
    rank,
    rankLabel,
    displayName: entry.displayName,
    total: entry.total,
    isYou: entry.profileId === user.id,
  }));

  return NextResponse.json({ ok: true, standings });
}
