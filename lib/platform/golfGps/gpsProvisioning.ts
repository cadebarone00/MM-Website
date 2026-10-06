import { isGpsCapable } from "./coursePreview";
import { GolfProviderError } from "./providers/GolfCourseProvider";
import { GolfCourseStoreError } from "./repository/courseStore";
import type { CourseLibraryEntry, CourseRepository } from "./repository/courseRepository";

/**
 * "Prepare GPS" for one course, on demand — never just because someone looked at it. Server-only.
 *
 * 1. Maroon course library first: a saved, GPS-ready course is returned as-is (no provider calls).
 * 2. A saved course with no GPS data that was imported within the last GPS_RETRY_AFTER_DAYS is NOT re-imported — its
 *    sources were already checked recently, so repeated taps can't hammer OpenGolf / Overpass.
 * 3. Otherwise: the repository's import (OpenGolf → OpenStreetMap → derived green targets) saves the course — new, or
 *    rebuilt in place with the same course / hole ids when the refresh rule allows (protected data is never overwritten).
 *    A provider failure throws before anything is saved, so nothing partial is stored and the stored copy is kept.
 * 4. Reports only: ready (+ Maroon course id) or why not, in plain categories the app turns into short messages.
 *
 * Simultaneous requests for the same course share one run (per server instance); providers' own fetch caches still apply.
 */

export const GPS_RETRY_AFTER_DAYS = 7;

export type GpsProvisionResult =
  | { status: "ready"; maroonCourseId: string }
  /** Course found, but its map data doesn't give playable GPS targets (yet). */
  | { status: "unavailable" }
  | { status: "not_found" }
  /** A source is busy / rate-limited / unreachable: try again shortly. */
  | { status: "busy" }
  | { status: "failed" };

export function createGpsProvisioner({ repository, now = () => new Date() }: { repository: CourseRepository; now?: () => Date }) {
  const inFlight = new Map<string, Promise<GpsProvisionResult>>();
  const recentlyChecked = (entry: CourseLibraryEntry) =>
    now().getTime() - new Date(entry.refreshedAt).getTime() < GPS_RETRY_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const result = (entry: CourseLibraryEntry): GpsProvisionResult =>
    isGpsCapable(entry.course) ? { status: "ready", maroonCourseId: entry.course.id } : { status: "unavailable" };

  async function run(openGolfId: string): Promise<GpsProvisionResult> {
    try {
      const stored = await repository.findCourseByExternalId("open_golf", openGolfId);
      if (stored && (isGpsCapable(stored.course) || recentlyChecked(stored))) return result(stored);
      const saved = await repository.importOpenGolfCourse(openGolfId);
      return saved ? result(saved) : { status: "not_found" };
    } catch (error) {
      if (error instanceof GolfProviderError) {
        if (error.kind === "bad_request") return { status: "not_found" };
        if (error.kind === "rate_limited" || error.kind === "timeout" || error.kind === "network") return { status: "busy" };
      }
      if (error instanceof GolfCourseStoreError && error.code === "protected_data") return { status: "unavailable" };
      console.error("GPS provisioning failed:", error instanceof Error ? error.message : error);
      return { status: "failed" };
    }
  }

  return {
    provision(openGolfId: string): Promise<GpsProvisionResult> {
      const running = inFlight.get(openGolfId);
      if (running) return running;
      const promise = run(openGolfId).finally(() => inFlight.delete(openGolfId));
      inFlight.set(openGolfId, promise);
      return promise;
    },
    /** True when Prepare GPS could do something new for this stored course (or it isn't stored yet). */
    canPrepare(stored: CourseLibraryEntry | null) {
      return !stored || (!isGpsCapable(stored.course) && !recentlyChecked(stored));
    },
  };
}

export type GpsProvisioner = ReturnType<typeof createGpsProvisioner>;
