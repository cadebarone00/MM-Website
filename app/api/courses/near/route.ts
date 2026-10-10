import { NextResponse } from "next/server";
import { GolfProviderError } from "@/lib/platform/golfGps/providers/GolfCourseProvider";
import { createOpenGolfClient, OPEN_GOLF_ATTRIBUTION } from "@/lib/platform/golfGps/providers/openGolf/client";
import { nearestCourses, stateFromPoints, type NearbyCandidate } from "@/lib/platform/golfGps/nearbyCourses";
import { nwsUserAgent, pointsUrl, POINTS_CACHE_SECONDS } from "@/lib/platform/weather/providers/nws";

/** Bigger states run past one 500-course page; a few pages covers every US state. */
const MAX_PAGES = 4;

/**
 * Courses near me: GET /api/courses/near?lat=…&lng=… (the phone's location; used only for this lookup, never stored).
 * Location → US state (National Weather Service) → that state's courses → nearest 8. US only.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat")), lng = Number(params.get("lng"));
  const headers = { "Cache-Control": "no-store" };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return NextResponse.json({ ok: false, code: "bad_request" }, { status: 400, headers });
  try {
    const points = await fetch(pointsUrl(lat, lng), { headers: { "User-Agent": nwsUserAgent(process.env.NWS_CONTACT), Accept: "application/geo+json" }, next: { revalidate: POINTS_CACHE_SECONDS }, signal: AbortSignal.timeout(8000) } as RequestInit);
    const state = points.ok ? stateFromPoints(await points.json()) : null;
    if (!state) return NextResponse.json({ ok: false, code: "outside_us" }, { headers });
    const client = createOpenGolfClient();
    const candidates: NearbyCandidate[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const reply = await client.byState(state, page * 500);
      candidates.push(...reply.courses);
      if (reply.courses.length < 500 || (reply.total !== null && candidates.length >= reply.total)) break;
    }
    return NextResponse.json({ ok: true, state, courses: nearestCourses(candidates, lat, lng), attribution: OPEN_GOLF_ATTRIBUTION }, { headers });
  } catch (error) {
    const busy = error instanceof GolfProviderError && error.kind === "rate_limited";
    if (!busy) console.error("Nearby courses failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, code: busy ? "busy" : "unavailable" }, { status: busy ? 503 : 502, headers });
  }
}
