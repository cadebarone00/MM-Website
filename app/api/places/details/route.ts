import { NextResponse } from "next/server";
import { getPlace, locationFailureStatus } from "@/lib/platform/location/locationService";

/**
 * Coordinates for a picked destination suggestion: GET /api/places/details?placeId=…&session=…
 * The Google key stays on the server.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = await getPlace(params.get("placeId") ?? "", params.get("session") ?? "");
  const headers = { "Cache-Control": "no-store" };
  if (!result.ok) return NextResponse.json({ ok: false, code: result.code }, { status: locationFailureStatus(result.code), headers });
  return NextResponse.json({ ok: true, place: result.data }, { headers });
}
