import { NextResponse } from "next/server";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";
import { placesDone, ratingAnswers, submitRatings } from "@/lib/platform/venuePlacesServer";

/**
 * After-visit ratings (Venue places phase 4), members only:
 *   GET  /api/golf-trips/<trip>/ratings  → { done: [placeId] }   places I already rated or skipped on this trip
 *   POST /api/golf-trips/<trip>/ratings  { ratings: [{ placeId, rating 1-10, visitedOn }], skips: [placeId] }
 */
type Params = { params: Promise<{ tripId: string }> };
async function member(params: Params["params"]) {
  const { tripId } = await params;
  const view = await getGolfTrip(tripId);
  return view.status === "ok" ? { tripId, profileId: view.viewer.profileId }
    : { error: NextResponse.json({ error: "Trip not found." }, { status: view.status === "signed-out" ? 401 : 404 }) };
}

export async function GET(_request: Request, { params }: Params) {
  const who = await member(params);
  if ("error" in who) return who.error;
  const done = await placesDone(who.profileId, who.tripId);
  if (!done) return NextResponse.json({ error: "Ratings aren't switched on yet." }, { status: 503 });
  return NextResponse.json({ done }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: Params) {
  const who = await member(params);
  if ("error" in who) return who.error;
  const answers = ratingAnswers(await request.json().catch(() => null));
  if (!answers) return NextResponse.json({ error: "Rate (1-10) or skip at least one place." }, { status: 400 });
  const stored = await submitRatings(who.profileId, who.tripId, answers);
  if (stored === null) return NextResponse.json({ error: "Couldn't save your ratings. Try again." }, { status: 503 });
  return NextResponse.json({ ok: true, stored, skipped: answers.skips.length });
}
