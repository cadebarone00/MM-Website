import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { publishOfficialMatchState } from "@/lib/live/publishOfficialMatchState";

/**
 * Re-publishes the editable locked setup into player Career Archive shells.
 * It runs at initial lock and after a pre-start matchup edit, so downstream
 * data never remains pointed at an old tee time, course, partner, or opponent.
 */
export async function syncLockedRoundToCareerArchive(seasonYear: number, round: number): Promise<void> {
  const service = createSupabaseServiceRoleClient();
  const { data: roundState, error: roundError } = await service
    .from("live_round_state")
    .select("date, course_id, format, course_locked, matchups_locked, started")
    .eq("season_year", seasonYear)
    .eq("round", round)
    .single();
  if (roundError || !roundState?.course_locked || !roundState.matchups_locked || roundState.started || !roundState.course_id || !roundState.format) return;

  const [{ data: course, error: courseError }, { data: boxes, error: boxesError }] = await Promise.all([
    service.from("live_courses").select("name, holes").eq("id", roundState.course_id).single(),
    service.from("live_match_boxes").select("id, format, maroon_players, white_players").eq("season_year", seasonYear).eq("round", round),
  ]);
  if (courseError || boxesError || !course) throw new Error("Could not load the locked round for archive publishing.");

  const rows = (boxes ?? []).flatMap((box) => {
    const sides = [[box.maroon_players as string[], box.white_players as string[]], [box.white_players as string[], box.maroon_players as string[]]] as const;
    return sides.flatMap(([side, opponents]) => side.map((playerSlug, index) => ({
      season_year: seasonYear,
      round,
      player_slug: playerSlug,
      course: course.name,
      played_on: roundState.date,
      format: box.format,
      match_box_id: box.id,
      partner_slug: side.length === 2 ? side[1 - index] : null,
      opponent_slugs: opponents,
      status: "scheduled",
      holes: course.holes,
    })));
  });
  const activePlayers = rows.map((row) => row.player_slug);
  const { data: previous } = await service
    .from("career_archive_rounds")
    .select("player_slug")
    .eq("season_year", seasonYear)
    .eq("round", round)
    .eq("status", "scheduled");
  const stale = (previous ?? []).map((row) => row.player_slug as string).filter((playerSlug) => !activePlayers.includes(playerSlug));
  if (stale.length > 0) {
    const { error } = await service.from("career_archive_rounds").delete().eq("season_year", seasonYear).eq("round", round).eq("status", "scheduled").in("player_slug", stale);
    if (error) throw error;
  }

  if (rows.length > 0) {
    const { error } = await service.from("career_archive_rounds").upsert(rows, { onConflict: "season_year,round,player_slug" });
    if (error) throw error;
  }

  // Locking and pre-start edits both receive a canonical zero-hole state and
  // fresh pre-round odds snapshot before any player opens their portal.
  for (const box of boxes ?? []) {
    await publishOfficialMatchState(seasonYear, box.id as string, "match_locked");
  }
}
