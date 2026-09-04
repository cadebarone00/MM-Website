import { NextResponse } from "next/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type Hole = { number?: number; par?: number; yards?: number };

/**
 * Readiness gate for the Total Tournament Birdies future. It intentionally
 * returns no odds: a market may only be priced after every tournament round
 * has a locked course/format/matchup and the selected player is scheduled.
 */
export async function GET(_: Request, { params }: { params: Promise<{ playerSlug: string }> }) {
  const { playerSlug } = await params;
  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();
  const [{ data: settings, error: settingsError }, { data: roster, error: rosterError }, { data: rounds, error: roundsError }, { data: boxes, error: boxesError }, { data: courses, error: coursesError }] = await Promise.all([
    service.from("live_tournament_settings").select("round_count").eq("season_year", seasonYear).maybeSingle(),
    service.from("live_roster").select("player_slug").eq("season_year", seasonYear).eq("player_slug", playerSlug).maybeSingle(),
    service.from("live_round_state").select("round, course_id, format, course_locked, matchups_locked").eq("season_year", seasonYear).order("round"),
    service.from("live_match_boxes").select("round, format, maroon_players, white_players").eq("season_year", seasonYear),
    service.from("live_courses").select("id, name, holes"),
  ]);
  const error = settingsError ?? rosterError ?? roundsError ?? boxesError ?? coursesError;
  if (error) {
    return NextResponse.json({
      ok: false,
      error: `The live database setup is not ready for tournament futures (${error.message}). Run the latest supabase/live_match_publication.sql once in Supabase SQL Editor, then refresh this page.`,
    }, { status: 500 });
  }

  const blockers: string[] = [];
  const roundCount = settings?.round_count ?? null;
  if (!roundCount) blockers.push("Tiger has not set the tournament round count yet.");
  if (!roster) blockers.push("This player is not on the active tournament roster.");

  const courseById = new Map((courses ?? []).map((course) => [course.id as string, course]));
  const roundByNumber = new Map((rounds ?? []).map((round) => [round.round as number, round]));
  const setup = [] as { round: number; course: string | null; format: string | null; eligibleForBirdies: boolean; status: "ready" | "missing"; detail: string }[];

  for (let roundNumber = 1; roundNumber <= (roundCount ?? 0); roundNumber += 1) {
    const round = roundByNumber.get(roundNumber);
    if (!round) {
      blockers.push(`Round ${roundNumber} has not been created.`);
      setup.push({ round: roundNumber, course: null, format: null, eligibleForBirdies: false, status: "missing", detail: "Round setup is missing." });
      continue;
    }
    const course = round.course_id ? courseById.get(round.course_id as string) : null;
    const format = round.format as string | null;
    const playerBox = (boxes ?? []).find((box) =>
      box.round === roundNumber && ([...(box.maroon_players ?? []), ...(box.white_players ?? [])] as string[]).includes(playerSlug),
    );
    const issues: string[] = [];
    if (!round.course_locked || !course) issues.push("course must be selected and locked");
    if (!format) issues.push("format must be selected");
    if (!round.matchups_locked) issues.push("matchups must be locked");
    if (!playerBox) issues.push("player must be assigned to a match");
    const validHoleLayout = Array.isArray(course?.holes) && (course.holes as Hole[]).length === 18 && (course.holes as Hole[]).every((hole) => hole.number && hole.par && hole.yards);
    if (course && !validHoleLayout) issues.push("course needs a complete 18-hole par and yardage layout");
    if (issues.length) blockers.push(`Round ${roundNumber}: ${issues.join(", ")}.`);
    const roundFormat = (playerBox?.format ?? format) as string | null;
    const eligibleForBirdies = roundFormat === "Singles" || roundFormat === "Fourball";
    setup.push({
      round: roundNumber,
      course: (course?.name as string | undefined) ?? null,
      format: roundFormat,
      eligibleForBirdies,
      status: issues.length ? "missing" : "ready",
      detail: issues.length ? issues.join(" · ") : eligibleForBirdies ? "Included in the birdie simulation." : "Alternate Shot: no individual birdie opportunities.",
    });
  }

  if (roundCount && setup.filter((round) => round.status === "ready" && round.eligibleForBirdies).length === 0) {
    blockers.push("No locked Singles or Fourball round is available for an individual birdie total.");
  }

  return NextResponse.json({
    ok: true,
    seasonYear,
    ready: blockers.length === 0,
    blockers,
    rounds: setup,
  }, { headers: { "Cache-Control": "no-store" } });
}
