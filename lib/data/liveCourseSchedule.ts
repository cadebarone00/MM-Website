import type { CourseHole, VenueCourse } from "./types";

export interface LiveCourseSummary {
  id: string;
  name: string;
  holes: { number: number; par: number; yards: number }[];
}

/**
 * Converts Tiger Center's live course-library rows (Course Library panel /
 * `live_courses` table) into the public VenueCourse shape /schedule
 * renders. Used to source the upcoming year's course boxes from real Tiger
 * Center data instead of the hand-written venue files, which have never
 * had course data filled in for any year.
 */
export function buildVenueCoursesFromLive(courses: LiveCourseSummary[]): VenueCourse[] {
  return courses.map((course) => {
    const holes: CourseHole[] = [...course.holes]
      .sort((a, b) => a.number - b.number)
      .map((hole) => ({ hole: hole.number, par: hole.par, yards: hole.yards }));
    return {
      id: course.id,
      name: course.name,
      par: holes.length ? holes.reduce((sum, hole) => sum + (hole.par ?? 0), 0) : null,
      yards: holes.length ? holes.reduce((sum, hole) => sum + (hole.yards ?? 0), 0) : null,
      photos: [],
      holes,
    };
  });
}
