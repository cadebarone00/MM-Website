import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { libraryIdFromRef, libraryRef, type CourseHit } from "../courseRefs";
import { getCourseLibrary } from "./courseLibrary";

type Row = { id: string; name: string; address: { city?: string; state?: string } | null;
  golf_course_external_ids: { provider: string; external_id: string }[] | null; golf_holes: { par: number }[] | null };

/**
 * Courses in The Maroon's library (supabase/golf_course_data.sql) whose name has what was typed, as search results.
 * A course imported from OpenGolf keeps its OpenGolf ref; one we entered gets a "maroon:" ref. Throws if the library
 * isn't set up (callers carry on without it).
 */
export async function searchCourseLibrary(text: string, limit: number): Promise<CourseHit[]> {
  const words = text.trim().replace(/[%_,()\\]/g, " ").split(/\s+/).filter(Boolean).slice(0, 5);
  if (!words.length) return [];
  let query = createSupabaseServiceRoleClient().from("golf_courses").select("id, name, address, golf_course_external_ids(provider, external_id), golf_holes(par)");
  for (const word of words) query = query.ilike("name", `%${word}%`);
  const { data, error } = await query.order("name").limit(limit);
  if (error) throw new Error(`Course library search failed: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => {
    const openGolf = row.golf_course_external_ids?.find((e) => e.provider === "open_golf")?.external_id;
    const pars = row.golf_holes ?? [];
    return { ref: openGolf ?? libraryRef(row.id), name: row.name, city: row.address?.city ?? null, state: row.address?.state ?? null,
      par: pars.length === 18 ? pars.reduce((sum, hole) => sum + hole.par, 0) : null };
  });
}

/** The library course for a search ref ("maroon:<id>" or an OpenGolf id), or null when the library doesn't have it. */
export async function findLibraryCourse(ref: string) {
  const library = getCourseLibrary();
  const id = libraryIdFromRef(ref);
  return id ? library.getCourseById(id) : library.findCourseByExternalId("open_golf", ref);
}
