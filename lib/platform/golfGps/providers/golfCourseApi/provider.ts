import type { GolfCourseProvider } from "../GolfCourseProvider";
import { normalizeGolfCourseApiCourse, normalizeGolfCourseApiSearchCourse } from "./adapter";
import { createGolfCourseApiClient, GOLF_COURSE_API_ATTRIBUTION, type GolfCourseApiClient } from "./client";

const MAX_RESULTS = 50;

/**
 * GolfCourseAPI as a GolfCourseProvider: search and course detail, returned as Maroon types only. Server-only.
 * Pass a client (e.g. one built with a fake fetch) and a clock in tests.
 *
 * GolfCourseAPI's search has no state filter or result limit: `limit` trims the list here, and `state` (when given)
 * keeps only hits in that state.
 */
export function createGolfCourseApiProvider({ client = createGolfCourseApiClient(), now = () => new Date() }: { client?: GolfCourseApiClient; now?: () => Date } = {}): GolfCourseProvider {
  return {
    provider: "golf_course_api",
    async searchCourses({ text, state, limit = 20 }) {
      const all = await client.search(text);
      const wanted = state?.trim().toUpperCase();
      const hits = wanted ? all.filter((course) => course.state?.toUpperCase() === wanted) : all;
      return {
        results: hits.slice(0, Math.min(MAX_RESULTS, Math.max(1, Math.floor(limit)))).map(normalizeGolfCourseApiSearchCourse),
        total: hits.length,
        attribution: GOLF_COURSE_API_ATTRIBUTION,
      };
    },
    async getCourseDetail(externalId) {
      const raw = await client.course(externalId);
      return raw ? normalizeGolfCourseApiCourse(raw, now().toISOString()) : null;
    },
  };
}
