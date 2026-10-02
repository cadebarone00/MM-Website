import { cache } from "react";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { golfTripSummaries, golfTripViewer, isGolfTripId, type GolfTripSummary, type GolfTripViewer, type SavedGolfTrip } from "./golfTripCreate.ts";

/**
 * Server-side reads of saved Golf Trips (supabase/golf_trips.sql). The user id always comes from the session,
 * never the request, and the database functions only return trips that person belongs to. Never import this
 * from a client component.
 */

export type GolfTripLoad =
  | { status: "signed-out" }
  | { status: "not-found" }
  | { status: "ok"; trip: SavedGolfTrip; viewer: GolfTripViewer };

/** One saved trip plus the signed-in person's role on it. A stranger gets "not-found", same as a missing trip. */
export const getGolfTrip = cache(async (tripId: string): Promise<GolfTripLoad> => {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return { status: "signed-out" };
  if (!isGolfTripId(tripId)) return { status: "not-found" };

  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_golf_trip", { p_profile: user.id, p_trip: tripId });
  if (error) throw new Error(`get_golf_trip failed: ${error.message}`);
  const trip = data as SavedGolfTrip | null;
  const viewer = trip ? golfTripViewer(trip, user.id) : null;
  return trip && viewer ? { status: "ok", trip, viewer } : { status: "not-found" };
});

export type UserGolfTrips =
  | { status: "signed-out" }
  | { status: "error" }
  | { status: "ok"; trips: GolfTripSummary[] };

/** Every Golf Trip the signed-in person is on (organizer or member), soonest first: the data for My Trips. */
export const getUserGolfTrips = cache(async (): Promise<UserGolfTrips> => {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return { status: "signed-out" };
  const { data, error } = await createSupabaseServiceRoleClient().rpc("list_my_golf_trips", { p_profile: user.id });
  if (error) {
    console.error("list_my_golf_trips failed:", error.message);
    return { status: "error" };
  }
  return { status: "ok", trips: golfTripSummaries(data) };
});
