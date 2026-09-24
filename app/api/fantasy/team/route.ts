import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchLiveTournament } from "@/lib/data/fetchLiveTournament";
import { validateFantasyPicks } from "@/lib/fantasy/validate";
import { fantasyTeamScore } from "@/lib/fantasy/scoring";
import { fantasyPicksLocked } from "@/lib/fantasy/lock";

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
    .select("tournament_slug, maroon_player, white_player, wildcard_player")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: "Couldn't load your fantasy team." }, { status: 500 });
  }

  // A team saved for a past tournament doesn't carry over — only a team
  // saved against the current tournament's slug counts as "saved".
  const picks = row && row.tournament_slug === tournament.slug
    ? { maroonPlayer: row.maroon_player, whitePlayer: row.white_player, wildcardPlayer: row.wildcard_player }
    : null;

  return NextResponse.json({
    ok: true,
    tournamentSlug: tournament.slug,
    editionLabel: tournament.editionLabel,
    roster: tournament.roster,
    picks,
    scores: picks ? fantasyTeamScore(tournament, picks) : null,
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

  const { error } = await supabase.from("fantasy_teams").upsert({
    profile_id: user.id,
    tournament_slug: tournament.slug,
    maroon_player: result.picks.maroonPlayer,
    white_player: result.picks.whitePlayer,
    wildcard_player: result.picks.wildcardPlayer,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "Couldn't save your fantasy team." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, picks: result.picks, scores: fantasyTeamScore(tournament, result.picks) });
}
