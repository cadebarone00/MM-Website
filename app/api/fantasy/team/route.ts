import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { fetchLiveTournament } from "@/lib/data/fetchLiveTournament";
import { validateFantasyPicks } from "@/lib/fantasy/validate";
import { fantasyTeamScore, type FantasyPicks } from "@/lib/fantasy/scoring";
import { fantasyPicksLocked } from "@/lib/fantasy/lock";
import { formatRankLabel, isTiedAmong, rankAmong } from "@/lib/fantasy/ranking";
import { sanitizeTeamName } from "@/lib/fantasy/teamName";
import type { Tournament } from "@/lib/data/types";

/**
 * Where you stand against everyone else who's drafted a team for this
 * tournament — a service-role read (fantasy_teams' RLS scopes the normal
 * cookie client to its own row only) of every saved team, scored with the
 * same fantasyTeamScore every other view already uses, so this can never
 * disagree with "your" score shown elsewhere.
 */
async function getFantasyStanding(
  tournament: Tournament,
  myTotal: number
): Promise<{ rank: number; rankLabel: string; totalPlayers: number }> {
  const service = createSupabaseServiceRoleClient();
  const { data: rows } = await service
    .from("fantasy_teams")
    .select("maroon_player, white_player, wildcard_player")
    .eq("tournament_slug", tournament.slug);

  const scores = (rows ?? []).map((row) => {
    const picks: FantasyPicks = { maroonPlayer: row.maroon_player, whitePlayer: row.white_player, wildcardPlayer: row.wildcard_player };
    return fantasyTeamScore(tournament, picks).total;
  });

  const rank = rankAmong(scores, myTotal);
  // Always at least 1 (yourself) — your own row is one of the ones just read.
  return { rank, rankLabel: formatRankLabel(rank, isTiedAmong(scores, myTotal)), totalPlayers: Math.max(scores.length, 1) };
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const tournament = await fetchLiveTournament();

  const { data: row, error } = await supabase
    .from("fantasy_teams")
    .select("tournament_slug, maroon_player, white_player, wildcard_player, team_name")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: "Couldn't load your fantasy team." }, { status: 500 });
  }

  // A team saved for a past tournament doesn't carry over — only a team
  // saved against the current tournament's slug counts as "saved".
  const currentRow = row && row.tournament_slug === tournament.slug ? row : null;
  const picks = currentRow
    ? { maroonPlayer: currentRow.maroon_player, whitePlayer: currentRow.white_player, wildcardPlayer: currentRow.wildcard_player }
    : null;

  const scores = picks ? fantasyTeamScore(tournament, picks) : null;
  const standing = scores ? await getFantasyStanding(tournament, scores.total) : null;

  return NextResponse.json({
    ok: true,
    tournamentSlug: tournament.slug,
    editionLabel: tournament.editionLabel,
    roster: tournament.roster,
    picks,
    teamName: currentRow?.team_name ?? null,
    scores,
    rank: standing?.rank ?? null,
    rankLabel: standing?.rankLabel ?? null,
    totalPlayers: standing?.totalPlayers ?? null,
  });
}

export async function POST(request: Request) {
  if (fantasyPicksLocked()) {
    return NextResponse.json({ ok: false, error: "Fantasy picks are closed — the tournament has started." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const tournament = await fetchLiveTournament();

  const result = validateFantasyPicks(tournament, {
    maroonPlayer: body?.maroonPlayer,
    whitePlayer: body?.whitePlayer,
    wildcardPlayer: body?.wildcardPlayer,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  const teamName = sanitizeTeamName(body?.teamName);

  const { error } = await supabase.from("fantasy_teams").upsert({
    profile_id: user.id,
    tournament_slug: tournament.slug,
    maroon_player: result.picks.maroonPlayer,
    white_player: result.picks.whitePlayer,
    wildcard_player: result.picks.wildcardPlayer,
    team_name: teamName,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "Couldn't save your fantasy team." }, { status: 500 });
  }

  const scores = fantasyTeamScore(tournament, result.picks);
  const standing = await getFantasyStanding(tournament, scores.total);

  return NextResponse.json({
    ok: true,
    picks: result.picks,
    teamName,
    scores,
    rank: standing.rank,
    rankLabel: standing.rankLabel,
    totalPlayers: standing.totalPlayers,
  });
}
