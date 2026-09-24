import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { TEST_SEASON_YEAR, isTestSeason } from "@/lib/live/testSeason";
import { getPlayerDisplayName } from "@/lib/data/players";
import { mapFutureHandicapRounds } from "@/lib/handicap/futureRoundMapping";
import { archivedDifferential } from "@/lib/handicap/archiveIndex";
import { summarizeTestSeason } from "@/lib/live/testSeasonStatus";

/** Tiger's rehearsal view: what the 2034 test matches have done behind the scenes (holes matched, who submitted, whether the round is official, and what it would do to a handicap). Host only; empty unless the test season is active. */
export async function GET() {
  if (!await requireHost()) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  const year = await getActiveSeasonYear();
  if (!isTestSeason(year)) return NextResponse.json({ ok: true, active: false, matches: [] });

  const service = createSupabaseServiceRoleClient();
  const { data: boxes, error: boxesError } = await service
    .from("live_match_boxes")
    .select("id, round, box_number, format, maroon_players, white_players")
    .eq("season_year", TEST_SEASON_YEAR)
    .order("round")
    .order("box_number");
  if (boxesError) return NextResponse.json({ ok: false, error: "Could not load the test matches." }, { status: 500 });
  const ids = (boxes ?? []).map((box) => box.id as string);

  const [confirmed, submissions, archive, archiveHoles, states] = await Promise.all([
    service.from("live_hole_scores").select("round, player_slug, hole").eq("season_year", TEST_SEASON_YEAR).not("confirmed_by", "is", null),
    ids.length ? service.from("live_match_box_submissions").select("match_box_id, player_slug").in("match_box_id", ids) : Promise.resolve({ data: [], error: null }),
    service.from("career_archive_rounds").select("season_year, round, player_slug, course, played_on, format, handicap_setup, status").eq("season_year", TEST_SEASON_YEAR),
    service.from("career_archive_live_holes").select("season_year, round, player_slug, hole, score, did_not_finish").eq("season_year", TEST_SEASON_YEAR),
    ids.length ? service.from("live_match_official_state").select("match_box_id, status, leader, margin, thru").in("match_box_id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  const failed = [confirmed, submissions, archive, archiveHoles, states].find((result) => result.error);
  if (failed) return NextResponse.json({ ok: false, error: "Could not load the rehearsal status." }, { status: 500 });

  // Would this round count toward the player's handicap? Uses the real mapping (18 holes, tee setup, individual format, official status), opting in to the test season only for this view.
  const handicapCounts: Record<string, boolean> = {};
  for (const row of archive.data ?? []) {
    const holes = (archiveHoles.data ?? []).filter((hole) => hole.player_slug === row.player_slug && hole.round === row.round);
    const [mapped] = mapFutureHandicapRounds([row], holes, [], { includeTestSeason: true });
    handicapCounts[`${row.round}:${row.player_slug}`] = !!mapped && archivedDifferential(mapped) != null;
  }

  const matches = summarizeTestSeason({
    boxes: (boxes ?? []).map((box) => ({ id: box.id as string, round: box.round as number, boxNumber: box.box_number as number, format: box.format as string, maroonPlayers: box.maroon_players as string[], whitePlayers: box.white_players as string[] })),
    confirmedHoles: (confirmed.data ?? []) as { round: number; player_slug: string; hole: number }[],
    submissions: (submissions.data ?? []) as { match_box_id: string; player_slug: string }[],
    archiveStatuses: (archive.data ?? []).map((row) => ({ round: row.round as number, player_slug: row.player_slug as string, status: row.status as string })),
    officialStates: (states.data ?? []) as { match_box_id: string; status: string; leader: string; margin: number; thru: number }[],
    handicapCounts,
  }, getPlayerDisplayName);
  return NextResponse.json({ ok: true, active: true, matches }, { headers: { "Cache-Control": "no-store" } });
}
