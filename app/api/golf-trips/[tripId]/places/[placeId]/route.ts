import { NextResponse } from "next/server";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";
import { recordPlaceAdd, setPlaceSave, type PlaceActionResult } from "@/lib/platform/venuePlacesServer";

/**
 * Venue places, phase 3 (members only, like the trip itself):
 *   PUT  /api/golf-trips/<trip>/places/<place>  { saved: true | false }  — heart / un-heart it for the trip
 *   POST /api/golf-trips/<trip>/places/<place>                           — it was put on the trip's itinerary
 */
type Params = { params: Promise<{ tripId: string; placeId: string }> };

async function member(params: Params["params"]) {
  const { tripId, placeId } = await params;
  const view = await getGolfTrip(tripId);
  return view.status === "ok" ? { tripId, placeId, profileId: view.viewer.profileId }
    : { error: NextResponse.json({ error: "Trip not found." }, { status: view.status === "signed-out" ? 401 : 404 }) };
}
const reply = (result: PlaceActionResult, body: Record<string, unknown>) => result === "ok"
  ? NextResponse.json({ ok: true, ...body }) : NextResponse.json({ error: result === "not-found" ? "Place not found." : "Places aren't switched on yet." }, { status: result === "not-found" ? 404 : 503 });

export async function PUT(request: Request, { params }: Params) {
  const who = await member(params);
  if ("error" in who) return who.error;
  const body = await request.json().catch(() => null) as { saved?: unknown } | null;
  if (typeof body?.saved !== "boolean") return NextResponse.json({ error: "Say whether it's saved." }, { status: 400 });
  return reply(await setPlaceSave(who.profileId, who.tripId, who.placeId, body.saved), { saved: body.saved });
}

export async function POST(_request: Request, { params }: Params) {
  const who = await member(params);
  if ("error" in who) return who.error;
  return reply(await recordPlaceAdd(who.profileId, who.tripId, who.placeId), { added: true });
}
