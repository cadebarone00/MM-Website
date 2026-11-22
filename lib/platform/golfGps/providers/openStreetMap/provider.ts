import type { GolfCourse } from "../../domain";
import type { GolfGeometryCounts, GolfGeometryEnrichment, GolfGeometryProvider } from "../GolfGeometryProvider";
import { enrichWithOsm } from "./adapter";
import { courseCandidatesQuery, courseFeaturesQuery, createOverpassClient, OSM_ATTRIBUTION, type OverpassClient } from "./client";
import { boundingBox } from "./geometry";
import { chooseCourse, evaluateCandidates, nameTokens } from "./matching";

/** Extra room around the matched course's outline when fetching its features (tees and bunkers often sit on the edge). */
const FEATURE_BOX_PADDING_METERS = 60;
/**
 * Names to match OSM courses against. The club name only counts when it adds words the course name doesn't have: at a
 * multi-course club ("Pinehurst Cc – No. 2", club "Pinehurst Cc") the bare club name would match the whole resort's
 * outline as well as the right course, and the tie leaves nothing attached.
 */
export function matchNames(course: Pick<GolfCourse, "name" | "facilityName">): string[] {
  const own = new Set(nameTokens(course.name));
  const club = course.facilityName;
  return club && nameTokens(club).some((word) => !own.has(word)) ? [course.name, club] : [course.name];
}

const NO_COUNTS: GolfGeometryCounts = { courseBoundary: false, holeCenterlines: 0, greens: 0, tees: 0, fairways: 0, bunkers: 0, penaltyAreas: 0, unassigned: 0 };

/**
 * OpenStreetMap as a GolfGeometryProvider. Two Overpass queries at most: nearby course outlines, then — only after a
 * confident match — that course's features. Server-only. Pass a client (fake fetch) and a clock in tests.
 */
export function createOpenStreetMapGeometryProvider({ client = createOverpassClient(), now = () => new Date() }: { client?: OverpassClient; now?: () => Date } = {}): GolfGeometryProvider {
  return {
    provider: "openstreetmap",
    async enrichCourse(course: GolfCourse): Promise<GolfGeometryEnrichment> {
      const unchanged = { course, candidates: [], courseBoundary: [], unassigned: [], counts: NO_COUNTS, attribution: OSM_ATTRIBUTION };
      const location = course.location;
      if (!location) return { ...unchanged, status: "no_location", notes: ["The course has no latitude / longitude, so OpenStreetMap wasn't searched."] };

      const notes: string[] = [];
      const names = matchNames(course);
      const evaluated = evaluateCandidates(location, names, await client.run(courseCandidatesQuery(location)), notes);
      const candidates = evaluated.map((e) => e.candidate);
      const choice = chooseCourse(evaluated);
      if (choice.status !== "matched" || !choice.chosen) return { ...unchanged, candidates, status: choice.status, notes: [choice.reason, ...notes] };

      const chosen = choice.chosen;
      const elements = await client.run(courseFeaturesQuery(boundingBox(chosen.rings.flatMap((ring) => ring.outer), FEATURE_BOX_PADDING_METERS)));
      const result = enrichWithOsm({
        course, location, chosen, matchConfidence: choice.confidence!, others: evaluated.filter((e) => e !== chosen), elements, importedAt: now().toISOString(),
      });
      return {
        status: "matched",
        course: result.course,
        match: { candidate: chosen.candidate, confidence: choice.confidence! },
        candidates,
        courseBoundary: result.courseBoundary,
        unassigned: result.unassigned,
        counts: result.counts,
        notes: [choice.reason, ...notes, ...result.notes],
        attribution: OSM_ATTRIBUTION,
      };
    },
  };
}
