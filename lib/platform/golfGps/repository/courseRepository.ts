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
 * Refresh: re-imports from the sources (OpenGolf → OpenStreetMap → derived targets) and rebuilds the stored copy in place
 * (same course and hole ids). Only courses made entirely of imported open data can be refreshed — the database refuses
 * otherwise (see supabase/golf_course_data.sql, "Refresh rule"). If a provider fails, nothing is saved and the stored
 * course stays exactly as it was.
 */

export const STALE_AFTER_DAYS = 180;

export interface CourseLibraryEntry extends StoredGolfCourse {
  stale: boolean;
}

/** Builds a playable course from an OpenGolf id (normally loadPlayableOpenGolfCourse); null when OpenGolf has no such course. */
export type OpenGolfImporter = (openGolfId: string) => Promise<PlayableCourse | null>;

export function createCourseRepository({ store, importOpenGolf, now = () => new Date() }: {
  store: GolfCourseStore;
  importOpenGolf: OpenGolfImporter;
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
  const importAndSave = async (openGolfId: string) => {
    const playable = await importOpenGolf(openGolfId);
    return playable ? entry(await store.save(playable.course)) : null;
  };

  return {
    getCourseById,
    findCourseByExternalId,
    saveCourse: async (course: PlayableCourse["course"]) => entry(await store.save(course)),

    /**
     * The one import flow: stored course if there is one (no provider calls); otherwise OpenGolf → OSM → targets → save.
     * Scorecard-only courses are saved too. Null when OpenGolf has no such course.
     */
    async getOrImportOpenGolfCourse(openGolfId: string): Promise<{ entry: CourseLibraryEntry; from: "library" | "import" } | null> {
      const stored = await findCourseByExternalId("open_golf", openGolfId);
      if (stored) return { entry: stored, from: "library" };
      const saved = await importAndSave(openGolfId);
      return saved ? { entry: saved, from: "import" } : null;
    },

    /** Re-import a stored course from its OpenGolf id and rebuild it in place. Throws (saving nothing) if a provider fails. */
    async refreshCourse(courseId: string): Promise<CourseLibraryEntry> {
      const stored = await store.load(courseId);
      if (!stored) throw new Error("No stored course with that id.");
      const openGolfId = stored.course.externalIds.find((id) => id.provider === "open_golf")?.id;
      if (!openGolfId) throw new Error("This course has no OpenGolf id to refresh from.");
      const refreshed = await importAndSave(openGolfId);
      if (!refreshed) throw new Error("OpenGolf no longer has this course; the stored copy was kept.");
      return refreshed;
    },
  };
}

export type CourseRepository = ReturnType<typeof createCourseRepository>;
