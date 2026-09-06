import { historicalCourseLibrary } from "@/lib/live/historicalCourseLibrary";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Idempotently makes corrected archive course setups available to every season. */
export async function seedHistoricalCourseLibrary() {
  const service = createSupabaseServiceRoleClient();
  const library = historicalCourseLibrary();
  const { data: existing, error: loadError } = await service.from("live_courses").select("name");
  if (loadError) throw loadError;
  const names = new Set((existing ?? []).map((course) => String(course.name).trim().toLowerCase()));
  const missing = library.filter((course) => !names.has(course.name.toLowerCase()));
  if (missing.length) {
    const rows = missing.map((course) => ({ ...course, tee_sets: [{ id: "standard", name: "Archive setup", holes: course.holes, rating: null, slope: null }] }));
    const { error } = await service.from("live_courses").insert(rows);
    if (error) throw error;
  }
  return { added: missing.length, total: library.length };
}
