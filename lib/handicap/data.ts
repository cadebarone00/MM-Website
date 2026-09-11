import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { calculateDifferential, calculateHandicapIndex, calculateLowIndex } from "./whs";
import { validateSubmitInput } from "./validate";
import { availableTeeSets } from "@/lib/live/teeSets";
import type { LiveTeeSet } from "@/lib/live/types";
import type { ArchivedTeeSetup, HandicapCourseOption, HandicapCourseTeeSet, HandicapRoundSummary, HandicapSummary, SubmitHandicapRoundInput } from "./types";

interface CourseRow {
  id: string;
  name: string;
  tee_sets: unknown;
  city?: string | null;
  state?: string | null;
}

function isWellFormedTeeSet(value: unknown): value is HandicapCourseTeeSet {
  const t = value as Partial<HandicapCourseTeeSet> | null;
  return (
    !!t &&
    typeof t.id === "string" &&
    typeof t.name === "string" &&
    typeof t.rating === "number" &&
    typeof t.slope === "number" &&
    Array.isArray(t.holes)
  );
}

/** Pure — no I/O — so it's directly unit-testable without a live Supabase instance. */
export function mapCourseRow(row: CourseRow): HandicapCourseOption {
  const teeSets = Array.isArray(row.tee_sets) ? availableTeeSets(row.tee_sets as LiveTeeSet[]).filter(isWellFormedTeeSet) : [];
  return { id: row.id, name: row.name, city: row.city ?? null, state: row.state ?? null, teeSets };
}

/** Pure — no I/O. Snapshots a course's tee set into the shape archived_scorecard_rounds.handicap_setup stores, so a later course-library edit never changes an already-assigned round's math. */
export function buildArchiveTeeSetup(course: HandicapCourseOption, teeSetId: string): ArchivedTeeSetup | null {
  const teeSet = course.teeSets.find((t) => t.id === teeSetId);
  if (!teeSet) return null;
  return { courseId: course.id, teeSetId: teeSet.id, teeSetName: teeSet.name, rating: teeSet.rating, slope: teeSet.slope, holes: teeSet.holes };
}

export async function getCourseLibraryForHandicap(): Promise<HandicapCourseOption[]> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from("live_courses").select("id, name, tee_sets, city, state").order("name");
  if (error) throw new Error("Could not load the course library.");
  return (data ?? []).map(mapCourseRow).filter((course) => course.teeSets.length > 0);
}

interface RoundRow {
  id: string;
  course_id: string;
  tee_set_name: string;
  rating: number;
  slope: number;
  date_played: string;
  tee_time: string | null;
  total_score: number;
  differential: number;
  live_courses: { name: string } | { name: string }[] | null;
}

function courseNameFromJoin(joined: RoundRow["live_courses"]): string {
  if (!joined) return "Unknown course";
  return Array.isArray(joined) ? (joined[0]?.name ?? "Unknown course") : joined.name;
}

/** Pure — no I/O — so it's directly unit-testable without a live Supabase instance. */
export function mapRoundRow(row: RoundRow): HandicapRoundSummary {
  return {
    id: row.id,
    courseId: row.course_id,
    courseName: courseNameFromJoin(row.live_courses),
    teeSetName: row.tee_set_name,
    rating: row.rating,
    slope: row.slope,
    datePlayed: row.date_played,
    teeTime: row.tee_time,
    totalScore: row.total_score,
    differential: row.differential,
  };
}

export async function getHandicapSummaryForPlayer(playerSlug: string): Promise<HandicapSummary> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("handicap_rounds")
    .select("id, course_id, tee_set_name, rating, slope, date_played, tee_time, total_score, differential, live_courses(name)")
    .eq("player_slug", playerSlug)
    .order("date_played", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load handicap rounds.");

  const rows = (data ?? []) as unknown as RoundRow[];
  const rounds: HandicapRoundSummary[] = rows.map(mapRoundRow);

  const mostRecent20Differentials = rounds.slice(0, 20).map((r) => r.differential);
  const chronologicalDifferentials = [...rounds].reverse().map((r) => r.differential);

  return {
    index: calculateHandicapIndex(mostRecent20Differentials),
    lowIndex: calculateLowIndex(chronologicalDifferentials),
    rounds,
  };
}

export async function submitHandicapRound(
  playerSlug: string,
  input: SubmitHandicapRoundInput
): Promise<{ ok: true; roundId: string } | { ok: false; error: string }> {
  const validation = validateSubmitInput(input);
  if (!validation.ok) return validation;

  const service = createSupabaseServiceRoleClient();
  const { data: courseRow, error: courseError } = await service
    .from("live_courses")
    .select("id, name, tee_sets")
    .eq("id", input.courseId)
    .maybeSingle();
  if (courseError || !courseRow) return { ok: false, error: "Course not found." };

  const course = mapCourseRow(courseRow as CourseRow);
  const teeSet = course.teeSets.find((t) => t.id === input.teeSetId);
  if (!teeSet) return { ok: false, error: "Tee set not found." };

  const holeInfoByNumber = new Map(teeSet.holes.map((h) => [h.number, h]));
  for (const hole of input.holes) {
    if (!holeInfoByNumber.has(hole.hole)) return { ok: false, error: `Tee set has no data for hole ${hole.hole}.` };
  }

  const totalScore = input.holes.reduce((sum, h) => sum + h.score, 0);
  const differential = calculateDifferential(totalScore, teeSet.rating, teeSet.slope);

  const { data: roundRow, error: roundError } = await service
    .from("handicap_rounds")
    .insert({
      player_slug: playerSlug,
      course_id: course.id,
      tee_set_id: teeSet.id,
      tee_set_name: teeSet.name,
      rating: teeSet.rating,
      slope: teeSet.slope,
      date_played: input.datePlayed,
      tee_time: input.teeTime,
      total_score: totalScore,
      differential,
    })
    .select("id")
    .single();
  if (roundError || !roundRow) return { ok: false, error: "Could not save this round." };

  const holeRows = input.holes.map((hole) => {
    const info = holeInfoByNumber.get(hole.hole)!;
    const firMissed = info.par !== 3 && !hole.fir;
    return {
      round_id: roundRow.id,
      hole: hole.hole,
      par: info.par,
      yards: info.yards,
      score: hole.score,
      putts: hole.putts,
      fir: info.par === 3 ? "X" : hole.fir ? "1" : "0",
      gir: hole.gir,
      fir_direction: firMissed ? hole.firDirection : null,
      gir_direction: hole.gir ? null : hole.girDirection,
    };
  });

  const { error: holesError } = await service.from("handicap_round_holes").insert(holeRows);
  if (holesError) {
    await service.from("handicap_rounds").delete().eq("id", roundRow.id);
    return { ok: false, error: "Could not save this round's holes. Please try again." };
  }

  return { ok: true, roundId: roundRow.id };
}
