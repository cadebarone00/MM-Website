import type { GolfCourse } from "./domain";
import type { GolfCourseImport, GolfCourseProvider } from "./providers/GolfCourseProvider";
import type { GolfGeometryEnrichment, GolfGeometryProvider } from "./providers/GolfGeometryProvider";
import { createOpenGolfProvider } from "./providers/openGolf/provider";
import { createOpenStreetMapGeometryProvider } from "./providers/openStreetMap/provider";
import { deriveCourseGreenTargets, type HoleTargetReport } from "./targets/deriveGreenTargets";

/**
 * The course-data pipeline, in one place, so no page combines providers itself. Server-only.
 *
 *   scorecard course (OpenGolf)  →  + map geometry (OpenStreetMap)  →  + playable green targets  →  Maroon GolfCourse
 *
 * The result is the provider-independent GolfCourse; the provider details ride along only for dev / reporting.
 */

export interface PlayableCourse {
  course: GolfCourse;
  geometry: GolfGeometryEnrichment;
  targets: HoleTargetReport[];
}

export async function enrichGolfCourse(course: GolfCourse, {
  geometryProvider = createOpenStreetMapGeometryProvider(),
  now = () => new Date(),
}: { geometryProvider?: GolfGeometryProvider; now?: () => Date } = {}): Promise<PlayableCourse> {
  const geometry = await geometryProvider.enrichCourse(course);
  const { course: playable, holes } = deriveCourseGreenTargets(geometry.course, now().toISOString());
  return { course: playable, geometry: { ...geometry, course: playable }, targets: holes };
}

/** Scorecard + geometry + targets for one OpenGolf course id. Null when OpenGolf has no such course. */
export async function loadPlayableOpenGolfCourse(openGolfId: string, {
  courseProvider = createOpenGolfProvider(),
  ...options
}: { courseProvider?: GolfCourseProvider; geometryProvider?: GolfGeometryProvider; now?: () => Date } = {}): Promise<(PlayableCourse & { scorecard: GolfCourseImport }) | null> {
  const scorecard = await courseProvider.getCourseDetail(openGolfId);
  if (!scorecard) return null;
  return { ...(await enrichGolfCourse(scorecard.course, options)), scorecard };
}
