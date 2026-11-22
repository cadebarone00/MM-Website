import type { GolfDataProvider } from "../domain";
import type { PlayableCourse } from "../courseEnrichment";
import type { GolfCourseStore, StoredGolfCourse } from "./courseStore";

/**
 * The course library: stored Maroon courses first, providers only when needed. Provider-independent — the import
 * pipeline is passed in. Server-only (pages and the GPS screen never touch the database or providers themselves).
 *
 * Freshness: a stored course is always served as-is — loading never calls a provider. After STALE_AFTER_DAYS it is
 * flagged `stale` so a person can choose to refresh it; nothing refreshes on its own (no provider polling).
 *
 * Refresh: re-imports from the sources (GolfCourseAPI → OpenStreetMap → derived targets) and rebuilds the stored copy in place
 * (same course and hole ids). Only courses made entirely of imported open data can be refreshed — the database refuses
 * otherwise (see supabase/golf_course_data.sql, "Refresh rule"). If a provider fails, nothing is saved and the stored
 * course stays exactly as it was.
 */

export const STALE_AFTER_DAYS = 180;

export interface CourseLibraryEntry extends StoredGolfCourse {
  stale: boolean;
}

/** Builds a playable course from an GolfCourseAPI id (normally loadPlayableCourse); null when GolfCourseAPI has no such course. */
export type CourseImporter = (courseRef: string) => Promise<PlayableCourse | null>;

export function createCourseRepository({ store, importer, now = () => new Date() }: {
  store: GolfCourseStore;
  importer: CourseImporter;
  now?: () => Date;
}) {
  const entry = (stored: StoredGolfCourse): CourseLibraryEntry => ({
    ...stored,
    stale: now().getTime() - new Date(stored.refreshedAt).getTime() > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
  });
  const getCourseById = async (courseId: string) => {
    const stored = await store.load(courseId);
    return stored ? entry(stored) : null;
  };
  const findCourseByExternalId = async (provider: GolfDataProvider, externalId: string) => {
    const id = await store.findIdByExternalId(provider, externalId);
    return id ? getCourseById(id) : null;
  };
  const importAndSave = async (courseRef: string) => {
    const playable = await importer(courseRef);
    return playable ? entry(await store.save(playable.course)) : null;
  };

  return {
    getCourseById,
    findCourseByExternalId,
    saveCourse: async (course: PlayableCourse["course"]) => entry(await store.save(course)),
    /**
     * Import from the sources (GolfCourseAPI → OpenStreetMap → targets) and save — creating the course, or rebuilding a stored
     * one in place (same course and hole ids) when the refresh rule allows. Null when GolfCourseAPI has no such course. A
     * provider failure throws before anything is saved.
     */
    importCourse: importAndSave,

    /**
     * The one import flow: stored course if there is one (no provider calls); otherwise GolfCourseAPI → OSM → targets → save.
     * Scorecard-only courses are saved too. Null when GolfCourseAPI has no such course.
     */
    async getOrImportCourse(courseRef: string): Promise<{ entry: CourseLibraryEntry; from: "library" | "import" } | null> {
      const stored = await findCourseByExternalId("golf_course_api", courseRef);
      if (stored) return { entry: stored, from: "library" };
      const saved = await importAndSave(courseRef);
      return saved ? { entry: saved, from: "import" } : null;
    },

    /** Re-import a stored course from its GolfCourseAPI id and rebuild it in place. Throws (saving nothing) if a provider fails. */
    async refreshCourse(courseId: string): Promise<CourseLibraryEntry> {
      const stored = await store.load(courseId);
      if (!stored) throw new Error("No stored course with that id.");
      const courseRef = stored.course.externalIds.find((id) => id.provider === "golf_course_api")?.id;
      if (!courseRef) throw new Error("This course has no GolfCourseAPI id to refresh from.");
      const refreshed = await importAndSave(courseRef);
      if (!refreshed) throw new Error("GolfCourseAPI no longer has this course; the stored copy was kept.");
      return refreshed;
    },
  };
}

export type CourseRepository = ReturnType<typeof createCourseRepository>;
