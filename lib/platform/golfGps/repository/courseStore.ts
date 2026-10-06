import type { GolfCourse, GolfDataProvider } from "../domain";
import { fromStoredRows, toStoragePayload, type StoredCourseRows } from "./storageRows";

/**
 * Stored courses, through the database functions in supabase/golf_course_data.sql. Knows nothing about providers or
 * pages. `call` runs one database function and returns its result (or throws): the Supabase service-role client on the
 * server (supabaseCourseStore.ts), an in-memory Postgres in tests.
 */
export type DatabaseCall = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

export interface StoredGolfCourse {
  course: GolfCourse;
  importedAt?: string;
  refreshedAt: string;
}

export interface GolfCourseStore {
  findIdByExternalId(provider: GolfDataProvider, externalId: string): Promise<string | null>;
  load(courseId: string): Promise<StoredGolfCourse | null>;
  /** Saves (or rebuilds in place) and returns the stored copy as it now reads back. */
  save(course: GolfCourse): Promise<StoredGolfCourse>;
}

/** Why a save was refused, in words a dev page can show. */
export class GolfCourseStoreError extends Error {
  constructor(readonly code: "protected_data" | "external_id_taken" | "not_set_up" | "failed", message: string) {
    super(message);
    this.name = "GolfCourseStoreError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createGolfCourseStore(call: DatabaseCall): GolfCourseStore {
  const run = async (fn: string, args: Record<string, unknown>) => {
    try {
      return await call(fn, args);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (text.includes("golf_course_has_protected_data")) throw new GolfCourseStoreError("protected_data", "This course holds verified or non-open data, so a source refresh can't overwrite it.");
      if (text.includes("golf_course_external_id_taken")) throw new GolfCourseStoreError("external_id_taken", "These provider ids belong to two different stored courses.");
      if (/function .* does not exist|Could not find the function|relation .* does not exist/i.test(text)) {
        throw new GolfCourseStoreError("not_set_up", "Course storage isn't set up yet — run supabase/golf_course_data.sql in Supabase first.");
      }
      throw new GolfCourseStoreError("failed", `Course storage failed: ${text}`);
    }
  };
  const load = async (courseId: string): Promise<StoredGolfCourse | null> => {
    if (!UUID.test(courseId)) return null;
    const rows = await run("get_golf_course", { p_course: courseId }) as StoredCourseRows | null;
    if (!rows) return null;
    const imported = rows.course.imported_at, refreshed = rows.course.refreshed_at;
    return {
      course: fromStoredRows(rows),
      ...(typeof imported === "string" && { importedAt: new Date(imported).toISOString() }),
      refreshedAt: new Date(String(refreshed)).toISOString(),
    };
  };
  return {
    async findIdByExternalId(provider, externalId) {
      const id = await run("find_golf_course_id", { p_provider: provider, p_external_id: externalId });
      return typeof id === "string" ? id : null;
    },
    load,
    async save(course) {
      const id = await run("save_golf_course", { p_payload: toStoragePayload(course) });
      const saved = typeof id === "string" ? await load(id) : null;
      if (!saved) throw new GolfCourseStoreError("failed", "The course saved but couldn't be read back.");
      return saved;
    },
  };
}
