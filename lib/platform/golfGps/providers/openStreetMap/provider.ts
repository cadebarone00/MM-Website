import type { GolfCourse } from "../../domain";
import type { GolfGeometryCounts, GolfGeometryEnrichment, GolfGeometryProvider } from "../GolfGeometryProvider";
import { enrichWithOsm } from "./adapter";
import { courseCandidatesQuery, courseFeaturesQuery, createOverpassClient, OSM_ATTRIBUTION, type OverpassClient } from "./client";
import { boundingBox } from "./geometry";
import { chooseCourse, evaluateCandidates } from "./matching";

/** Extra room around the matched course's outline when fetching its features (tees and bunkers often sit on the edge). */
const FEATURE_BOX_PADDING_METERS = 60;
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
      const names = [course.name, course.facilityName].filter((name): name is string => Boolean(name));
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
