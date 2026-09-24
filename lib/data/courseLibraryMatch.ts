import { canonicalCourseName } from "./canonicalCourse";

function normalized(name: string): string {
  return canonicalCourseName(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

// Historical scorecards abbreviate these layouts. Keep distinct courses at
// the same club separate; never choose a course merely because it is similar.
const aliases: Record<string, string> = {
  palmer: "Mission Hills CC - Palmer",
  "pete dye": "Mission Hills CC - Pete Dye",
  tournament: "Mission Hills CC - Dinah Shore Tournament",
  "dinah shore": "Mission Hills CC - Dinah Shore Tournament",
  classic: "Indian Wells CC - Classic",
  cove: "Indian Wells CC - Cove",
};

export function matchCourseLibrary<T extends { id: string; name: string }>(name: string, courses: T[]): T | null {
  const key = normalized(name);
  if (!key) return null;
  const target = normalized(aliases[key] ?? name);
  const exact = courses.filter((course) => normalized(course.name) === target);
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  // Club suffix spelling is cosmetic, but layout names are not.
  const clubKey = (value: string) => normalized(value).replace(/\b(country club|golf club|golf course|cc)\b/g, "").replace(/^the\s+/, "").replace(/\s+/g, " ").trim();
  const candidates = courses.filter((course) => clubKey(course.name) === clubKey(aliases[key] ?? name));
  return candidates.length === 1 ? candidates[0] : null;
}
