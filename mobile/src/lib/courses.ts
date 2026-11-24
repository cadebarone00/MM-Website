import { cityState } from "@/lib/data/usStates";

/** One result from /api/courses/search (website CourseResult). `ref` opens the course later; it is never shown. */
export interface CourseResult { ref: string; name: string; city: string | null; state: string | null; par: number | null }
export type RecentCourse = CourseResult & { id: string };

export const isRecentCourse = (value: unknown): value is RecentCourse => {
  const v = value as RecentCourse | null;
  return !!v && typeof v.id === "string" && typeof v.ref === "string" && typeof v.name === "string";
};

/** Same storage name as the website's list (different phone storage, same idea). */
export const RECENT_COURSES_KEY = "maroon-course-recent-v1";
export const COURSE_DEBOUNCE_MS = 350;

export const coursePlace = (course: { city?: string | null; state?: string | null }) => cityState(course.city, course.state);

/** "Tampa, FL · Par 72", or "Location unavailable". */
export const courseLine = (course: CourseResult) =>
  [coursePlace(course), course.par !== null ? `Par ${course.par}` : null].filter(Boolean).join(" · ") || "Location unavailable";

/** The search's busy / unavailable message (website CourseSearchScreen). */
export const courseSearchError = (code: string | null) =>
  code === "busy" ? "Course search is busy right now. Try again in a few minutes." : "Course search isn't available right now.";
