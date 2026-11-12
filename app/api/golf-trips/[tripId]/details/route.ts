import { NextResponse } from "next/server";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";
import { golfTripDetailsFromBody } from "@/lib/platform/golfTripDetails";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * PATCH { tripName, destination, destinationPlaceId?, destinationLatitude?, destinationLongitude?, travelMode }
 * General Settings: the organizer changes the trip's name, destination and travel (supabase/golf_trip_details.sql).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const view = await getGolfTrip(tripId);
  if (view.status !== "ok") return NextResponse.json({ ok: false, error: view.status === "signed-out" ? "Log in first." : "Trip not found." }, { status: view.status === "signed-out" ? 401 : 404 });
  if (!view.viewer.isOrganizer) return NextResponse.json({ ok: false, error: "Only the organizer can change trip details." }, { status: 403 });
  const parsed = golfTripDetailsFromBody(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.errors[0].message, errors: parsed.errors }, { status: 400 });
  const { details } = parsed;
  const { data, error } = await createSupabaseServiceRoleClient().rpc("update_golf_trip_details", {
    p_profile: view.viewer.profileId, p_trip: tripId, p_name: details.name, p_destination: details.destination,
    p_latitude: details.latitude, p_longitude: details.longitude, p_place_id: details.externalPlaceId, p_flight_plan: details.flightPlan,
  });
  if (error) {
    // Function not installed yet (supabase/golf_trip_details.sql not run in this database).
    if (["PGRST202", "42883"].includes(error.code)) return NextResponse.json({ ok: false, error: "Changing trip details isn't switched on yet." }, { status: 503 });
    if (error.code === "42501") return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
    if (error.code === "22023") return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: "Couldn't save trip details. Try again." }, { status: 500 });
  }
  if (data !== true) return NextResponse.json({ ok: false, error: "Trip not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
