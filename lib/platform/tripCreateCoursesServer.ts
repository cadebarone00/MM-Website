import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { CurrentProfile } from "@/lib/profile/currentProfile";
import { getGolfTripForProfile } from "./golfTripsServer";
import { loadSavedTripSetup } from "./savedTripSetupServer";
import { setupPlan } from "./savedTripSetup";
import { roundSlotKeys } from "./tripRoundPars";
import { confirmRoundPars, loadRoundCoursePars } from "./tripRoundParsServer";
import { pickedCoursesForSlots, type TripCoursePick } from "./tripCreateCourses";

/**
 * Right after create_golf_trip: the courses picked on the Courses step go into Trip Settings (pickedCourses), then each
 * round's pars are confirmed from its course scorecard (no tee yet: the organizer picks tees in Trip Settings). Never
 * throws: if anything here fails the trip still exists and Trip Settings → Round pars finishes it as before.
 */
export async function prepareTripCourses(current: CurrentProfile, profileId: string, tripId: string, picks: TripCoursePick[]): Promise<void> {
  if (!picks.length) return;
  try {
    const view = await getGolfTripForProfile(tripId, current);
    if (view.status !== "ok") return;
    const snapshot = await loadSavedTripSetup(view.trip);
    // Not installed, or settings already saved (a retried create with the same request): leave them alone.
    if (!snapshot.available || snapshot.revision !== 0) return;
    // Slots line up with round numbers only when every round has a date; otherwise a course could land on the wrong round.
    const slotKeys = roundSlotKeys(snapshot.basis, snapshot.values);
    if (slotKeys.length !== view.trip.rounds.length) return;
    const values = { ...snapshot.values, pickedCourses: pickedCoursesForSlots(slotKeys, picks) };
    const plan = setupPlan(view.trip, snapshot.basis, values);
    const saved = await createSupabaseServiceRoleClient().rpc("save_golf_trip_setup", {
      p_profile: profileId, p_trip: tripId, p_revision: 0, p_write: randomUUID(), p_settings: values,
      p_basis: snapshot.basis, p_arrival: plan.arrival, p_departure: plan.departure, p_capacity: plan.capacity, p_rounds: plan.rounds,
    });
    if (saved.error) { console.error("Saving the trip's picked courses failed:", saved.error.message); return; }
    await Promise.all(picks.map(async ({ roundNumber }) => {
      const course = await loadRoundCoursePars(view.trip, roundNumber);
      if (course.status !== "ok") return;
      await confirmRoundPars(profileId, tripId, roundNumber, course.pars, "course", { ref: course.ref, name: course.name, tee: course.tee, rating: course.rating, slope: course.slope });
    }));
  } catch (error) {
    console.error("Preparing the trip's courses failed:", error instanceof Error ? error.message : error);
  }
}
