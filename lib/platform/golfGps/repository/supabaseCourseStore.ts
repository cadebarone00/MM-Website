import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createGolfCourseStore, type GolfCourseStore } from "./courseStore";

/**
 * The stored-course library in Supabase, called with the server's service-role key (never sent to the browser).
 * Server-only. Only the database functions in supabase/golf_course_data.sql are called; the tables themselves have no
 * browser access.
 */
export function createSupabaseGolfCourseStore(): GolfCourseStore {
  return createGolfCourseStore(async (fn, args) => {
    const { data, error } = await createSupabaseServiceRoleClient().rpc(fn, args);
    if (error) throw new Error(`${error.message}${error.details ? ` (${error.details})` : ""}`);
    return data;
  });
}
