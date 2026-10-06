import { NextResponse } from "next/server";
import { getSavedCourseGps } from "@/lib/platform/golfGps/coursePreview";
import { getCourseLibrary } from "@/lib/platform/golfGps/repository/courseLibrary";

/**
 * GPS data for a course saved in the Maroon course library: GET /api/courses/library/<Maroon course id>/gps.
 * Reads the library only — no OpenGolf / OpenStreetMap calls. Normalized Maroon data through the GPS adapter.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "no-store" };
  try {
    const result = await getSavedCourseGps(id, (courseId) => getCourseLibrary().getCourseById(courseId));
    if (!result) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404, headers });
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch (error) {
    console.error("Saved course GPS failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, code: "unavailable" }, { status: 502, headers });
  }
}
