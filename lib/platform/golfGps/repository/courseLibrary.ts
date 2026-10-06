import "server-only";
import { loadPlayableOpenGolfCourse } from "../courseEnrichment";
import { createCourseRepository } from "./courseRepository";
import { createSupabaseGolfCourseStore } from "./supabaseCourseStore";

/** The real course library: Supabase storage + the OpenGolf → OpenStreetMap → targets import pipeline. Server-only. */
export function getCourseLibrary() {
  return createCourseRepository({ store: createSupabaseGolfCourseStore(), importOpenGolf: (id) => loadPlayableOpenGolfCourse(id) });
}
