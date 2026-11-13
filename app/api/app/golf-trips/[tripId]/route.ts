import { NextResponse } from "next/server";
import { loadTripFlightsData, loadTripPageData, loadTripSettingsData } from "@/lib/platform/tripPageData";

const headers = { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" };

/**
 * The iPhone / Android app's trip screens (project_specs.md "The Maroon as a real iPhone app"): the same data the
 * website's trip pages load on the server, for whoever is signed in (the app sends its login as a Bearer token).
 * ?view=page (default, with optional &round=<n>), settings or flights. Members only: anyone else gets "not found".
 */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "page";
  try {
    const data = view === "settings" ? await loadTripSettingsData(tripId)
      : view === "flights" ? await loadTripFlightsData(tripId)
      : await loadTripPageData(tripId, Number(url.searchParams.get("round")) || undefined);
    if (data.status === "signed-out") return NextResponse.json({ ok: false, error: "Sign in to see this trip." }, { status: 401, headers });
    if (data.status === "not-found") return NextResponse.json({ ok: false, error: "Trip not found." }, { status: 404, headers });
    return NextResponse.json({ ok: true, data }, { headers });
  } catch (error) {
    console.error("App trip data failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Couldn't load this trip. Try again." }, { status: 503, headers });
  }
}
