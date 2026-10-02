import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isGolfTripId } from "@/lib/platform/golfTripCreate";
import { flightFromRow, flightInputFromBody, golfTripFlightFailure } from "@/lib/platform/golfTripFlights";

/**
 * Golf Trip Info → Flights: add one of your own flights, or edit it when the body has its id. Members only; a
 * missing trip and someone else's trip get the same 404. Manual data only: nothing here calls a flight provider.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Log in to save your flights." }, { status: 401 });

  const { tripId } = await params;
  if (!isGolfTripId(tripId)) return NextResponse.json({ ok: false, error: "Trip not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = flightInputFromBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.errors[0]?.message ?? "Check the flight details.", errors: parsed.errors }, { status: 400 });
  }

  const { data, error } = await createSupabaseServiceRoleClient().rpc("save_golf_trip_flight", { p_profile: user.id, p_trip: tripId, p_flight: parsed.flight });
  const flight = error ? null : flightFromRow(data);
  if (!flight) {
    const failure = golfTripFlightFailure(error ?? {});
    if (failure.status >= 500) console.error("save_golf_trip_flight failed:", error?.message ?? "no flight returned");
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
  return NextResponse.json({ ok: true, flight }, { status: parsed.flight.id ? 200 : 201 });
}
