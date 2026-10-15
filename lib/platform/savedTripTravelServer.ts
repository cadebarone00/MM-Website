import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { SavedGolfTrip, GolfTripViewer } from "./golfTripCreate";
import { privateTripTravel, validPrivateTravel, type SavedTravelSnapshot } from "./savedTripTravel";
export async function loadSavedTripTravel(trip: SavedGolfTrip, viewer: GolfTripViewer): Promise<SavedTravelSnapshot> {
  const travel = privateTripTravel(trip, viewer);
  const { data, error } = await createSupabaseServiceRoleClient().from("golf_trip_personal_plans").select("payload,revision").eq("golf_trip_id", trip.trip.id).eq("profile_id", viewer.profileId).maybeSingle();
  if (error) return { travel, revision: 0, available: false };
  return { travel: data && validPrivateTravel(data.payload, viewer.memberId) ? { ...travel, ...data.payload } : travel, revision: data?.revision ?? 0, available: true };
}
