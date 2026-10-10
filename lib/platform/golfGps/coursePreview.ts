import { toPrototypeGpsCourse, type GolfCourse } from "./domain";
import type { GolfCourseImport } from "./providers/GolfCourseProvider";
import type { CourseLibraryEntry } from "./repository/courseRepository";
import type { GpsCourse } from "./types";

/**
 * What the app's Explore → Courses screen may know about a course: plain display fields, never raw provider or database
 * records. Server-only builders; the pages / API routes pass in the library lookup and the OpenGolf detail fetch.
 *
 * Order: the Maroon course library first (a saved course needs no provider call at all); otherwise the OpenGolf detail
 * for that one course, fetched only after the person picked it. OpenStreetMap is never called here.
 */

export interface CoursePreview {
  name: string;
  city?: string;
  state?: string;
  holeCount?: number;
  teeSets: { name: string; totalYards?: number }[];
  /** The scorecard, hole by hole: par, handicap (stroke index) when known, and each tee's yardage by tee name. Left out
   *  when the course has no holes listed. */
  scorecard?: { number: number; par: number; strokeIndex?: number; yards: Record<string, number> }[];
  library: {
    saved: boolean;
    /** Only for opening the saved course (GPS / profile); never shown as text. */
    maroonCourseId?: string;
    /** True only when the stored course has holes with real front / center / back targets. */
    gpsAvailable: boolean;
    /** True when the stored course has mapped greens. */
    mapAvailable: boolean;
    /** True when "Prepare GPS" can try to build GPS for this course (not stored yet, or not checked recently). */
    canPrepareGps: boolean;
  };
  /** Credit lines the screen must show with this data. */
  attribution: string;
}

/** A course the GPS screen can open: at least one hole with real front / center / back targets. */
export const isGpsCapable = (course: GolfCourse) => (course.coverage.holesWithGps ?? 0) > 0 && toPrototypeGpsCourse(course) !== null;

const credits = (course: GolfCourse) =>
  [...new Set(course.sources.map((source) => source.attribution).filter((text): text is string => Boolean(text)))].join(" · ");

function preview(course: GolfCourse, library: CoursePreview["library"]): CoursePreview {
  return {
    name: course.name,
    ...(course.address.city && { city: course.address.city }),
    ...(course.address.state && { state: course.address.state }),
    ...(course.holeCount > 0 && { holeCount: course.holeCount }),
    teeSets: course.teeSets.map((tee) => ({ name: tee.name, ...(tee.totalYards && { totalYards: tee.totalYards }) })),
    ...(course.holes.length > 0 && { scorecard: [...course.holes].sort((a, b) => a.number - b.number).map((hole) => ({
      number: hole.number, par: hole.par, ...(hole.strokeIndex && { strokeIndex: hole.strokeIndex }),
      yards: Object.fromEntries(hole.tees.filter((tee) => tee.yardage).map((tee) => [tee.name, tee.yardage!])),
    })) }),
    library,
    attribution: credits(course),
  };
}

export async function getCoursePreview(openGolfId: string, { findSaved, getDetail, canPrepare = (stored) => !stored || !isGpsCapable(stored.course) }: {
  findSaved: (openGolfId: string) => Promise<CourseLibraryEntry | null>;
  getDetail: (openGolfId: string) => Promise<GolfCourseImport | null>;
  /** Whether Prepare GPS is worth offering for this (stored or not) course — normally the GPS provisioner's rule. */
  canPrepare?: (stored: CourseLibraryEntry | null) => boolean;
}): Promise<CoursePreview | null> {
  let saved: CourseLibraryEntry | null = null;
  try {
    saved = await findSaved(openGolfId);
  } catch (error) {
    // Library unavailable (e.g. storage not set up yet): carry on as "not saved" rather than failing the screen.
    console.error("Course library lookup failed:", error instanceof Error ? error.message : error);
  }
  if (saved) {
    const { course } = saved;
    return preview(course, {
      saved: true,
      maroonCourseId: course.id,
      gpsAvailable: isGpsCapable(course),
      mapAvailable: course.coverage.features.greenPolygons,
      canPrepareGps: canPrepare(saved),
    });
  }
  const detail = await getDetail(openGolfId);
  return detail ? preview(detail.course, { saved: false, gpsAvailable: false, mapAvailable: false, canPrepareGps: canPrepare(null) }) : null;
}

/** A saved course, ready for the GPS screen (normalized Maroon data through the GPS adapter). Null if it can't be played. */
export async function getSavedCourseGps(maroonCourseId: string, getById: (id: string) => Promise<CourseLibraryEntry | null>):
  Promise<{ name: string; gps: GpsCourse; holeNumbers: number[] } | null> {
  const entry = await getById(maroonCourseId);
  const gps = entry ? toPrototypeGpsCourse(entry.course) : null;
  if (!entry || !gps) return null;
  return { name: entry.course.name, gps, holeNumbers: entry.course.holes.map((hole) => hole.number).sort((a, b) => a - b) };
}
