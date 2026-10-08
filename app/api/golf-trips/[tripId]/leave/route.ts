import { NextResponse } from "next/server";
import { leaveGolfTrip } from "@/lib/platform/golfTripsServer";

/** A member leaves the trip. The organizer can't leave their own trip (they delete it instead). */
export async function POST(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  try {
    const left = await leaveGolfTrip(tripId);
    if (left === "signed-out") return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401 });
    if (!left) return NextResponse.json({ ok: false, error: "You're not a member of this trip, or you're its organizer." }, { status: 404 });
    return NextResponse.json({ ok: true, url: "/golf-trips" });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "We couldn't take you off the trip. Try again." }, { status: 500 });
  }
}
