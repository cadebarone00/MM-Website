import { NextResponse } from "next/server";
import { GolfProviderError } from "@/lib/platform/golfGps/providers/GolfCourseProvider";
import { createGolfCourseApiProvider } from "@/lib/platform/golfGps/providers/golfCourseApi/provider";
import { mergeCourseHits, type CourseHit } from "@/lib/platform/golfGps/courseRefs";
import { searchCourseLibrary } from "@/lib/platform/golfGps/repository/courseLibrarySearch";

const LIMIT = 12;

/**
 * Course search (Explore → Courses, Play, trip course pickers): GET /api/courses/search?q=…
 * The Maroon course library first, then the GolfCourseAPI provider (owner request 2026-11-21); either can be down and the
 * other's results still show. Replies with just what the results list shows; `ref` opens a course later, never displayed.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const headers = { "Cache-Control": "no-store" };
  const [library, golfCourseApi] = await Promise.allSettled([
    searchCourseLibrary(q, LIMIT),
    createGolfCourseApiProvider().searchCourses({ text: q, limit: LIMIT }),
  ]);
  if (library.status === "rejected") console.error("Course library search failed:", library.reason instanceof Error ? library.reason.message : library.reason);
  const saved: CourseHit[] = library.status === "fulfilled" ? library.value : [];
  if (golfCourseApi.status === "fulfilled") {
    const found = golfCourseApi.value.results.map((course) => ({ ref: course.externalId.id, name: course.name, city: course.city ?? null, state: course.state ?? null, par: course.par ?? null }));
    return NextResponse.json({ ok: true, courses: mergeCourseHits(saved, found, LIMIT), attribution: golfCourseApi.value.attribution }, { headers });
  }
  const error = golfCourseApi.reason;
  const kind = error instanceof GolfProviderError ? error.kind : "failed";
  if (kind === "bad_request") return NextResponse.json({ ok: false, code: "bad_request" }, { status: 400, headers });
  // GolfCourseAPI down: our own library's results (possibly none) still answer the search.
  if (library.status === "fulfilled") return NextResponse.json({ ok: true, courses: saved, attribution: "" }, { headers });
  const status = kind === "rate_limited" ? 503 : 502;
  if (status === 502) console.error("Course search failed:", error instanceof Error ? error.message : error);
  return NextResponse.json({ ok: false, code: kind === "rate_limited" ? "busy" : "unavailable" }, { status, headers });
}
