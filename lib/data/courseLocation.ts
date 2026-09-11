/**
 * "City, ST" for display under a course's name (e.g. "The Colony, TX").
 * Either half may be missing — falls back to whichever is set, or null if
 * neither is. Zip code is never part of this — it's lookup-only.
 */
export function formatCourseLocation(city: string | null | undefined, state: string | null | undefined): string | null {
  const parts = [city?.trim(), state?.trim()].filter((part): part is string => !!part);
  return parts.length ? parts.join(", ") : null;
}
