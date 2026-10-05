import type { GolfCourseProvider } from "../GolfCourseProvider";
import { normalizeOpenGolfCourse, normalizeOpenGolfSearchCourse } from "./adapter";
import { createOpenGolfClient, OPEN_GOLF_ATTRIBUTION, type OpenGolfClient } from "./client";

/**
 * OpenGolfAPI as a GolfCourseProvider: search and course detail, returned as Maroon types only. Server-only.
 * Pass a client (e.g. one built with a fake fetch) and a clock in tests.
 */
export function createOpenGolfProvider({ client = createOpenGolfClient(), now = () => new Date() }: { client?: OpenGolfClient; now?: () => Date } = {}): GolfCourseProvider {
  return {
    provider: "open_golf",
    async searchCourses({ text, state, limit }) {
      const reply = await client.search(text, { state, limit });
      return {
        results: reply.courses.map(normalizeOpenGolfSearchCourse),
        ...(reply.total !== null && { total: reply.total }),
        attribution: OPEN_GOLF_ATTRIBUTION,
      };
    },
    async getCourseDetail(externalId) {
      const raw = await client.courseDetail(externalId);
      return raw ? normalizeOpenGolfCourse(raw, now().toISOString()) : null;
    },
  };
}
