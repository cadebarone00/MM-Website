import { after, NextResponse } from "next/server";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";
import { PLACE_CATEGORIES, type PlaceCategory } from "@/lib/platform/venuePlaces";
import { tripPlaces } from "@/lib/platform/venuePlacesServer";

/**
 * GET /api/golf-trips/<trip>/places?category=food|bars|golf|coffee|todo — the trip's recommended places (Venue tab,
 * phase 2). Members only (same rule as the trip itself). Answers straight from our database; stale or missing areas
 * are looked up on OpenStreetMap after the reply (`refreshing` lists them, so the screen can check back shortly).
 */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const view = await getGolfTrip(tripId);
  if (view.status !== "ok") return NextResponse.json({ error: "Trip not found." }, { status: view.status === "signed-out" ? 401 : 404 });
  const asked = new URL(request.url).searchParams.get("category");
  if (asked && !PLACE_CATEGORIES.some((c) => c.key === asked)) return NextResponse.json({ error: "Unknown category." }, { status: 400 });
  const result = await tripPlaces({ profileId: view.viewer.profileId, tripId, latitude: view.trip.trip.latitude ?? null, longitude: view.trip.trip.longitude ?? null,
    category: (asked as PlaceCategory | null) ?? null }, (work) => after(work));
  if (result.status === "unavailable") return NextResponse.json({ error: "Places aren't switched on yet." }, { status: 503 });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
