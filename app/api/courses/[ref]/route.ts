import { NextResponse } from "next/server";
import { getCoursePreview } from "@/lib/platform/golfGps/coursePreview";
import { GolfProviderError } from "@/lib/platform/golfGps/providers/GolfCourseProvider";
import { createGolfCourseApiProvider } from "@/lib/platform/golfGps/providers/golfCourseApi/provider";
import { getCourseLibrary } from "@/lib/platform/golfGps/repository/courseLibrary";
import { getGpsProvisioner } from "@/lib/platform/golfGps/gpsProvisioningServer";

/**
 * One picked course for Explore → Courses: GET /api/courses/<ref> (ref = the search result's handle).
 * Maroon course library first (no provider calls for a saved course), else GolfCourseAPI detail for this course only.
 * Never runs OpenStreetMap. Replies with display fields + simple library status only.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const headers = { "Cache-Control": "no-store" };
  try {
    const library = getCourseLibrary();
    const course = await getCoursePreview(ref, {
      findSaved: (id) => library.findCourseByExternalId("golf_course_api", id),
      getDetail: (id) => createGolfCourseApiProvider().getCourseDetail(id),
      canPrepare: (stored) => getGpsProvisioner().canPrepare(stored),
    });
    if (!course) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404, headers });
    return NextResponse.json({ ok: true, course }, { headers });
  } catch (error) {
    const kind = error instanceof GolfProviderError ? error.kind : "failed";
    // bad_request = not a GolfCourseAPI id (e.g. a ref from the old course source): that course can't be found.
    if (kind === "bad_request") return NextResponse.json({ ok: false, code: "not_found" }, { status: 404, headers });
    const status = kind === "rate_limited" ? 503 : 502;
    if (status === 502) console.error("Course preview failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, code: kind === "rate_limited" ? "busy" : "unavailable" }, { status, headers });
  }
}
