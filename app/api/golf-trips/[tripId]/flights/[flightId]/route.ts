import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isGolfTripId } from "@/lib/platform/golfTripCreate";

/** Golf Trip Info → Flights: delete one of your own flights. Someone else's flight gets the same 404 as a missing one. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ tripId: string; flightId: string }> }) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Log in to change your flights." }, { status: 401 });

  const { tripId, flightId } = await params;
  if (!isGolfTripId(tripId) || !isGolfTripId(flightId)) return NextResponse.json({ ok: false, error: "Flight not found." }, { status: 404 });

  const { data, error } = await createSupabaseServiceRoleClient().rpc("delete_golf_trip_flight", { p_profile: user.id, p_trip: tripId, p_flight: flightId });
  if (error) {
    // Function not installed yet (supabase/golf_trip_flights.sql not run in this database).
    if (error.code === "PGRST202" || error.code === "42883") {
      return NextResponse.json({ ok: false, error: "Saving flights isn't switched on yet." }, { status: 503 });
    }
    console.error("delete_golf_trip_flight failed:", error.message);
    return NextResponse.json({ ok: false, error: "We couldn't delete this flight. Try again." }, { status: 500 });
  }
  if (data !== true) return NextResponse.json({ ok: false, error: "Flight not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
