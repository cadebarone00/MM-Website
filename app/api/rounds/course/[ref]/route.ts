import { NextResponse } from "next/server";
import { scoringCourse } from "@/lib/platform/personalRound";
import { createOpenGolfProvider } from "@/lib/platform/golfGps/providers/openGolf/provider";
import { findLibraryCourse } from "@/lib/platform/golfGps/repository/courseLibrarySearch";
import { libraryIdFromRef } from "@/lib/platform/golfGps/courseRefs";

/**
 * Play a round: pars + tees (rating / slope) for one picked course. GET /api/rounds/course/<ref> (ref = the search result's handle).
 * Maroon course library first, else OpenGolf detail for this course only (same order as /api/courses/<ref>).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const headers = { "Cache-Control": "no-store" };
  try {
    let course = null;
    try { course = (await findLibraryCourse(ref))?.course ?? null; } catch { /* library not set up: use the provider */ }
    // A course we entered ("maroon:" ref) is only in the library.
    if (!course && !libraryIdFromRef(ref)) course = (await createOpenGolfProvider().getCourseDetail(ref))?.course ?? null;
    if (!course) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404, headers });
    const scoring = scoringCourse(ref, course);
    if (!scoring) return NextResponse.json({ ok: false, code: "no_scorecard" }, { status: 422, headers });
    return NextResponse.json({ ok: true, course: scoring }, { headers });
  } catch (error) {
    console.error("Round course failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, code: "unavailable" }, { status: 502, headers });
  }
}
