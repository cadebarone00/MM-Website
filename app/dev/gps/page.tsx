import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GolfGpsScreen } from "@/components/platform/gps/GolfGpsScreen";
import { loadPlayableOpenGolfCourse } from "@/lib/platform/golfGps/courseEnrichment";
import { toPrototypeGpsCourse } from "@/lib/platform/golfGps/domain";
import { GolfProviderError } from "@/lib/platform/golfGps/providers/GolfCourseProvider";
import { getCourseLibrary } from "@/lib/platform/golfGps/repository/courseLibrary";
import { CourseGpsNavigator } from "@/components/platform/gps/CourseGpsNavigator";

export const metadata: Metadata = { title: "GPS prototype | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * LOCAL DEV PREVIEW of the on-course GPS (Mission Hills Pete Dye, hole 6 from OpenStreetMap). Real / Mock GPS test controls are in the /dev simulator panel.
 * 404 unless NODE_ENV=development (`npm run dev`). The same screen opens from the Scoring sheet's GPS pill.
 *
 * `?maroonCourse=<Maroon course id>&hole=<n>` loads a course saved in the Maroon course library (Supabase only — no
 * OpenGolf / OpenStreetMap calls). `?course=<OpenGolf id>` is the live-import mode: OpenGolf scorecard + OpenStreetMap
 * geometry + derived green targets, built fresh through the course-enrichment service (nothing saved).
 */
export default async function GolfGpsPrototypePage({ searchParams }: { searchParams: Promise<{ course?: string; maroonCourse?: string; hole?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { course: courseId, maroonCourse, hole } = await searchParams;
  if (maroonCourse) return <SavedCourseGps maroonCourse={maroonCourse} hole={hole} />;
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
  return <main style={{ height: "100svh" }}><CourseGpsNavigator course={gpsCourse} holeNumbers={holeNumbers} initialHole={first} /></main>;
}

/** A course from the Maroon course library (Supabase), shown in the GPS screen. No provider calls. */
async function SavedCourseGps({ maroonCourse, hole }: { maroonCourse: string; hole?: string }) {
  let message: string | null = null;
  let entry: Awaited<ReturnType<ReturnType<typeof getCourseLibrary>["getCourseById"]>> = null;
  try {
    entry = await getCourseLibrary().getCourseById(maroonCourse);
    if (!entry) message = "No saved Maroon course with that id.";
  } catch (error) {
    message = error instanceof Error ? error.message : "Loading the saved course failed.";
  }
  const gpsCourse = entry ? toPrototypeGpsCourse(entry.course) : null;
  if (entry && !gpsCourse) message = `${entry.course.name}: no saved hole has playable green targets.`;
  if (!entry || !gpsCourse) {
    return <main style={{ height: "100svh", background: "#240001", color: "#fbf8f1", padding: 24, font: "15px system-ui" }}>
      <p>{message}</p>
      <p><a href="/dev/course-search" style={{ color: "#dcc495" }}>Back to course search</a></p>
    </main>;
  }
  const holeNumbers = entry.course.holes.map((h) => h.number).sort((a, b) => a - b);
  return <main style={{ height: "100svh" }}><CourseGpsNavigator course={gpsCourse} holeNumbers={holeNumbers} initialHole={Number(hole) || gpsCourse.holes[0].number} /></main>;
}
