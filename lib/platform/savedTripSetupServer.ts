import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { SavedGolfTrip } from "./golfTripCreate";
import { initialSetup, validSetup, type TripSetupSnapshot } from "./savedTripSetup";

/** Caller must first load the trip through getGolfTrip's member access check. */
export async function loadSavedTripSetup(trip: SavedGolfTrip): Promise<TripSetupSnapshot> {
  const fallback = initialSetup(trip);
  const { data, error } = await createSupabaseServiceRoleClient().from("golf_trip_setup").select("settings,basis,revision").eq("golf_trip_id", trip.trip.id).maybeSingle();
  if (error) {
    if (!["42P01", "PGRST205"].includes(error.code)) console.error("Loading trip setup failed", error.code);
    return fallback;
  }
  if (!data) return { ...fallback, available: true };
  if (!validSetup(data.settings) || !data.basis?.startDate || !Array.isArray(data.basis.rounds)) return fallback;
  return { values: data.settings, basis: data.basis, revision: data.revision, available: true };
}
