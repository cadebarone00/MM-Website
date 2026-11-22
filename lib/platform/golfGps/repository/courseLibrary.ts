import "server-only";
import { loadPlayableCourse } from "../courseEnrichment";
import { createCourseRepository } from "./courseRepository";
import { createSupabaseGolfCourseStore } from "./supabaseCourseStore";

/** The real course library: Supabase storage + the GolfCourseAPI → OpenStreetMap → targets import pipeline. Server-only. */
export function getCourseLibrary() {
  return createCourseRepository({ store: createSupabaseGolfCourseStore(), importer: (id) => loadPlayableCourse(id) });
}
