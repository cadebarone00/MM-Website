import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GolfGpsScreen } from "@/components/platform/gps/GolfGpsScreen";
import { loadPlayableOpenGolfCourse } from "@/lib/platform/golfGps/courseEnrichment";
import { toPrototypeGpsCourse } from "@/lib/platform/golfGps/domain";
import { GolfProviderError } from "@/lib/platform/golfGps/providers/GolfCourseProvider";
import { RealCourseGps } from "./RealCourseGps";

export const metadata: Metadata = { title: "GPS prototype | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * LOCAL DEV PREVIEW of the on-course GPS (Mission Hills Pete Dye, hole 6 from OpenStreetMap). Real / Mock GPS test controls are in the /dev simulator panel.
 * 404 unless NODE_ENV=development (`npm run dev`). The same screen opens from the Scoring sheet's GPS pill.
 *
 * `?course=<OpenGolf id>&hole=<n>` (from /dev/course-search's "Open in GPS") loads that real course instead: OpenGolf
 * scorecard + OpenStreetMap geometry + derived green targets, through the course-enrichment service.
 */
export default async function GolfGpsPrototypePage({ searchParams }: { searchParams: Promise<{ course?: string; hole?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { course: courseId, hole } = await searchParams;
  if (!courseId) {
    return <main style={{ height: "100svh", background: "#240001" }}>
      <GolfGpsScreen />
    </main>;
  }

  let message: string | null = null;
  let loaded: Awaited<ReturnType<typeof loadPlayableOpenGolfCourse>> = null;
  try {
    loaded = await loadPlayableOpenGolfCourse(courseId);
    if (!loaded) message = "OpenGolf has no course with that id.";
  } catch (error) {
    message = error instanceof GolfProviderError ? error.message : "Loading the course failed.";
  }
  const gpsCourse = loaded ? toPrototypeGpsCourse(loaded.course) : null;
  if (loaded && !gpsCourse) message = `${loaded.course.name}: no hole has playable green targets yet (OpenStreetMap: ${loaded.geometry.status.replace("_", " ")}).`;
  if (!loaded || !gpsCourse) {
    return <main style={{ height: "100svh", background: "#240001", color: "#fbf8f1", padding: 24, font: "15px system-ui" }}>
      <p>{message}</p>
      <p><a href="/dev/course-search" style={{ color: "#dcc495" }}>Back to course search</a></p>
    </main>;
  }
  const holeNumbers = [...loaded.course.holes].map((h) => h.number).sort((a, b) => a - b);
  const first = Number(hole) || gpsCourse.holes[0].number;
  return <RealCourseGps course={gpsCourse} holeNumbers={holeNumbers.length ? holeNumbers : gpsCourse.holes.map((h) => h.number)} initialHole={first} />;
}
