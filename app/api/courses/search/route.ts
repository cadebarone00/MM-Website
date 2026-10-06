import { NextResponse } from "next/server";
import { GolfProviderError } from "@/lib/platform/golfGps/providers/GolfCourseProvider";
import { createOpenGolfProvider } from "@/lib/platform/golfGps/providers/openGolf/provider";

/**
 * Course search for the app's Explore → Courses: GET /api/courses/search?q=…
 * Runs on the server through the OpenGolf provider (search only — no map data is loaded here). Replies with just what
 * the results list shows; `ref` is an opaque handle for opening a course later, never displayed.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const headers = { "Cache-Control": "no-store" };
  try {
    const { results, attribution } = await createOpenGolfProvider().searchCourses({ text: q, limit: 12 });
    return NextResponse.json({
      ok: true,
      courses: results.map((course) => ({ ref: course.externalId.id, name: course.name, city: course.city ?? null, state: course.state ?? null, par: course.par ?? null })),
      attribution,
    }, { headers });
  } catch (error) {
    const kind = error instanceof GolfProviderError ? error.kind : "failed";
    const status = kind === "bad_request" ? 400 : kind === "rate_limited" ? 503 : 502;
    if (status === 502) console.error("Course search failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, code: kind === "bad_request" ? "bad_request" : kind === "rate_limited" ? "busy" : "unavailable" }, { status, headers });
  }
}
