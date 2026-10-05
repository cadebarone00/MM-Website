import type { GolfCoordinate, GolfCourse, GolfDataProvider, GolfExternalId, GolfPolygon, GolfPolyline, GolfSourceMetadata } from "../domain";

/**
 * A provider that adds map geometry (holes, tees, greens, hazards …) to a course The Maroon already knows, e.g.
 * OpenStreetMap enriching an OpenGolf scorecard. Returns Maroon types only — never raw provider data. Server-only.
 */
export interface GolfGeometryProvider {
  provider: GolfDataProvider;
  /** Never throws for "nothing found" or "not sure": those come back as a status. Throws GolfProviderError when the provider can't be reached. */
  enrichCourse(course: GolfCourse): Promise<GolfGeometryEnrichment>;
}

/**
 * matched: one provider course matched confidently and its geometry was attached.
 * ambiguous: several provider courses matched about equally well — nothing attached.
 * low_confidence: provider courses are nearby but none matched well enough — nothing attached.
 * no_course_found: no provider course near the course's location.
 * no_location: the course has no latitude / longitude to search around.
 */
export type GolfGeometryMatchStatus = "matched" | "ambiguous" | "low_confidence" | "no_course_found" | "no_location";

/** One nearby provider course considered for the match, and the evidence for it. */
export interface GolfCourseCandidate {
  externalId: GolfExternalId;
  name?: string;
  /** Meters from the course's location to the candidate's boundary (0 when the location is inside it). */
  distanceMeters: number;
  containsLocation: boolean;
  /** 0–1 overlap between the course's name and the candidate's (numbers like "No. 2" must agree). */
  nameSimilarity: number;
}

export type GolfMappedFeatureKind = "hole" | "tee" | "green" | "fairway" | "bunker" | "penalty_area";

/** A real mapped feature of the matched course that couldn't be tied to one hole with confidence. */
export interface UnassignedGolfFeature {
  id: string;
  kind: GolfMappedFeatureKind;
  geometry:
    | { kind: "point"; point: GolfCoordinate }
    | { kind: "polygon"; polygon: GolfPolygon }
    | { kind: "line"; line: GolfPolyline };
  source: GolfSourceMetadata;
  /** Plain-English reason, e.g. "between holes 4 and 5". */
  reason: string;
}

/** What got attached to holes (unassigned features are counted separately). */
export interface GolfGeometryCounts {
  courseBoundary: boolean;
  holeCenterlines: number;
  greens: number;
  tees: number;
  fairways: number;
  bunkers: number;
  penaltyAreas: number;
  unassigned: number;
}

export interface GolfGeometryEnrichment {
  status: GolfGeometryMatchStatus;
  /** The course with geometry attached when matched; otherwise the course unchanged. */
  course: GolfCourse;
  match?: { candidate: GolfCourseCandidate; confidence: number };
  candidates: GolfCourseCandidate[];
  /** The matched course's outline(s). Kept here because GolfCourse has no course-level boundary. */
  courseBoundary: GolfPolygon[];
  unassigned: UnassignedGolfFeature[];
  counts: GolfGeometryCounts;
  /** Plain-English notes: why nothing matched, features that were skipped, disagreements with the scorecard. */
  notes: string[];
  /** Credit line the UI must show wherever this geometry is shown. */
  attribution: string;
}
