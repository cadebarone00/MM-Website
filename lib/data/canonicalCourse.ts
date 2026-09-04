/**
 * A scorecard/setup suffix identifies a particular visit or configuration, not
 * a different golf course. Keep this normalization at every archive/model
 * boundary so historical course experience aggregates correctly.
 */
export function canonicalCourseName(course: string): string {
  return course.replace(/\s*#\d+\s*$/u, "").trim();
}
