/**
 * Course search results carry a `ref` that opens the course later (owner request 2026-11-21: our library first, then
 * GolfCourseAPI, then add it by hand). Pure, so the search route, the course loaders and the phones agree:
 *   - "<GolfCourseAPI id>"        an GolfCourseAPI course (or a library course imported from it — same ref, so old links work);
 *   - "maroon:<library id>"  a course entered into The Maroon's library by us (provider "maroon");
 *   - "custom:<name>"        a course added by hand in Play (no scorecard on file; built while playing).
 */
export interface CourseHit { ref: string; name: string; city: string | null; state: string | null; par: number | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const libraryRef = (courseId: string) => `maroon:${courseId}`;
/** The library course id in a "maroon:" ref, or null for any other ref. */
export const libraryIdFromRef = (ref: string): string | null => {
  const id = ref.startsWith("maroon:") ? ref.slice("maroon:".length) : "";
  return UUID.test(id) ? id : null;
};
/** A hand-added course's ref: the same name always gets the same ref, so pars built there are remembered. */
export const customRef = (name: string) => `custom:${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "course"}`;
export const isCustomRef = (ref: string) => ref.startsWith("custom:");

/** Library hits first; an GolfCourseAPI hit the library already has (same ref) isn't repeated. */
export function mergeCourseHits(library: CourseHit[], golfCourseApi: CourseHit[], limit: number): CourseHit[] {
  const seen = new Set(library.map((hit) => hit.ref));
  return [...library, ...golfCourseApi.filter((hit) => !seen.has(hit.ref))].slice(0, limit);
}
