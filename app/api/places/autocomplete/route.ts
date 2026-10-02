import { NextResponse } from "next/server";
import { locationFailureStatus, searchPlaces } from "@/lib/platform/location/locationService";

/**
 * Destination suggestions for the Golf Trip questionnaire: GET /api/places/autocomplete?q=…&session=…
 * The Google key stays on the server. Not configured or failing → an error code, and the box stays plain text.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = await searchPlaces(params.get("q") ?? "", params.get("session") ?? "");
  const headers = { "Cache-Control": "no-store" };
  if (!result.ok) return NextResponse.json({ ok: false, code: result.code }, { status: locationFailureStatus(result.code), headers });
  return NextResponse.json({ ok: true, suggestions: result.data }, { headers });
}
