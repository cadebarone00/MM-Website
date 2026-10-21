import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createOpenGolfProvider } from "./golfGps/providers/openGolf/provider";
import { getCourseLibrary } from "./golfGps/repository/courseLibrary";
import type { SavedGolfTrip } from "./golfTripCreate";
import { loadSavedTripSetup } from "./savedTripSetupServer";
import { coursePars, roundCoursePick, type CourseParsResult } from "./tripRoundPars";

/**
 * H5C Part 1 — a trip round's pars on the server (supabase/golf_trip_round_pars.sql). Callers load the trip through
 * getGolfTrip first and pass only an organizer's profile for writes; the database checks the organizer again.
 */

export type RoundCourseLoad =
  | { status: "no-course" }
  | { status: "not-found" | "unavailable" | "no-scorecard" | "tee-par"; ref: string; name: string; tee: string | null }
  | { status: "ok"; ref: string; name: string; tee: string | null; pars: number[] };

/** The round's course + tee from Trip Settings, and its pars through scoringCourse() (course library first, then OpenGolf). */
export async function loadRoundCoursePars(trip: SavedGolfTrip, roundNumber: number): Promise<RoundCourseLoad> {
  const setup = await loadSavedTripSetup(trip);
  const pick = roundCoursePick(setup.basis, setup.values, roundNumber);
  if (!pick) return { status: "no-course" };
  const teeName = pick.tees?.tee ?? null;
  try {
    let course = null;
    try { course = (await getCourseLibrary().findCourseByExternalId("open_golf", pick.ref))?.course ?? null; } catch { /* library not set up: use the provider */ }
    course ??= (await createOpenGolfProvider().getCourseDetail(pick.ref))?.course ?? null;
    if (!course) return { status: "not-found", ref: pick.ref, name: pick.name, tee: teeName };
    const result: CourseParsResult = coursePars(pick.ref, course, pick.tees);
    return result.ok ? { status: "ok", ref: pick.ref, name: pick.name, tee: result.tee, pars: result.pars }
      : { status: result.reason, ref: pick.ref, name: pick.name, tee: teeName };
  } catch (error) {
    console.error("Round course pars failed:", error instanceof Error ? error.message : error);
    return { status: "unavailable", ref: pick.ref, name: pick.name, tee: teeName };
  }
}

/** Organizer saves the round's pars. False = refused (not organizer, bad pars, or the round already has a score). */
export async function confirmRoundPars(profileId: string, tripId: string, roundNumber: number, pars: number[],
  source: "course" | "manual", course: { ref: string | null; name: string | null; tee: string | null }): Promise<boolean | "failed"> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("confirm_trip_round_pars", {
    p_profile: profileId, p_trip: tripId, p_round: roundNumber, p_pars: pars, p_source: source,
    p_course_ref: course.ref, p_course_name: course.name, p_tee: course.tee,
  });
  if (error) { console.error("confirm_trip_round_pars failed:", error.message); return "failed"; }
  return data === true;
}

/** Organizer sets a scoring group's starting hole (shotgun). False = refused (not organizer, or the group has a score). */
export async function setGroupStartHole(profileId: string, tripId: string, groupId: string, startHole: number): Promise<boolean | "failed"> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("set_trip_group_start_hole", { p_profile: profileId, p_trip: tripId, p_group: groupId, p_start_hole: startHole });
  if (error) { console.error("set_trip_group_start_hole failed:", error.message); return "failed"; }
  return data === true;
}
