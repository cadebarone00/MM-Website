import type { GolfDataCoverage } from "./coverage";
import type { GolfCoordinate, GolfCoordinate3D, GolfPolygon, GolfPolyline } from "./geometry";
import type { GolfExternalId, GolfSourceMetadata, GolfVerification } from "./provenance";
/**
 * The Maroon's own golf-course format. Provider adapters turn OpenGolfAPI / OpenStreetMap / etc. responses INTO these
 * types; UI components read only these types. Every "if known" field is optional and left out when no source has it —
 * never filled with a made-up value.
 *
 * Ids (`id` fields) are stable Maroon ids (text), not provider ids — those live in `externalIds`.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Tees
// ---------------------------------------------------------------------------------------------------------------------

/** Who a course / slope rating applies to. Scorecards often rate the same tees separately for men and women. */
export type GolfRatingGender = "men" | "women" | "unspecified";

export interface GolfTeeRating {
  gender: GolfRatingGender;
  courseRating: number;
  slopeRating: number;
}

/**
 * A set of tees across the whole course ("Blue", "Championship"). Ratings and slope belong here because they're rated
 * per tee set, not per hole.
 */
export interface GolfTeeSet {
  id: string;
  name: string;
  /** Display color if the source gives one, as text ("blue") or hex ("#1e4fa3"). */
  color?: string;
  totalYards?: number;
  /** Course par from these tees, when it differs from the sum of hole pars or the source states it. */
  par?: number;
  ratings?: GolfTeeRating[];
}

/** Where a tee box is: a single point, or its outline when mapped. */
export type GolfTeeLocation =
  | { kind: "point"; coordinate: GolfCoordinate; source?: GolfSourceMetadata }
  | { kind: "polygon"; polygon: GolfPolygon };

/**
 * One tee box on one hole. Links to its course-wide GolfTeeSet by `teeSetId` when known; mapped tee boxes (e.g. from
 * OpenStreetMap) usually don't say which tee set they are, so they have a location but no `teeSetId`.
 */
export interface GolfTee {
  id: string;
  teeSetId?: string;
  /** Usually the tee set's name; repeated so a hole can be shown without looking up the tee set. */
  name: string;
  color?: string;
  location?: GolfTeeLocation;
  /** Scorecard yardage from this tee to the hole (not a GPS measurement). */
  yardage?: number;
  /** Only when this tee plays to a different par / stroke index than the hole's default (e.g. a forward-tee par 5). */
  par?: number;
  strokeIndex?: number;
}

// ---------------------------------------------------------------------------------------------------------------------
// Green
// ---------------------------------------------------------------------------------------------------------------------

/**
 * FUTURE: measured green heights. Shapes are reserved so 3D / slope work can fill them in; nothing computes them yet.
 */
export interface GolfGreenElevation {
  /** Measured points across the green, with altitude. */
  samples: GolfCoordinate3D[];
  source?: GolfSourceMetadata;
}

/** FUTURE: green slope at measured points (how steep, and which way the ground falls). */
export interface GolfGreenSlope {
  samples: { coordinate: GolfCoordinate; gradePercent: number; fallDirectionDegrees: number }[];
  source?: GolfSourceMetadata;
}

/** FUTURE: one contour line on the green (all points at `altitude` meters). */
export interface GolfGreenContour {
  altitude: number;
  line: GolfPolyline;
}

/**
 * How The Maroon worked a value out from other data (rather than a source measuring it). Derived values are never
 * "surveyed" or "verified" — `inputs` says which source data they came from.
 */
export interface GolfDerivation {
  derivedBy: "maroon";
  /**
   * polygon_centroid: area-weighted middle of the outline. polygon_interior_point: the outline's middle fell outside
   * it (odd shape), so the middle of the widest strip through it was used. approach_axis_intersection: where the line
   * of play through the center crosses the outline.
   */
  method: "polygon_centroid" | "polygon_interior_point" | "approach_axis_intersection";
  /** ISO 8601. */
  derivedAt: string;
  inputs: GolfSourceMetadata[];
  /** For front / back: the compass direction of play onto the green, and where that direction came from. */
  approachBearingDegrees?: number;
  directionSource?: "centerline_final_segment" | "tee_to_green";
}

/**
 * The green. A scorecard-only course has no green data; a GPS course has front / center / back points; a mapped course
 * also has the outline. Front / back are relative to the normal line of play. When the points were worked out from the
 * outline (not given by a source), `derivation` says how.
 */
export interface GolfGreen {
  polygon?: GolfPolygon;
  front?: GolfCoordinate;
  center?: GolfCoordinate;
  back?: GolfCoordinate;
  derivation?: { center?: GolfDerivation; frontBack?: GolfDerivation };
  elevation?: GolfGreenElevation;
  slope?: GolfGreenSlope;
  contours?: GolfGreenContour[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Fairways and hazards
// ---------------------------------------------------------------------------------------------------------------------

/** One fairway shape. A hole can have several (split fairways, a fairway broken by a creek). */
export interface GolfFairway {
  id: string;
  polygon: GolfPolygon;
}

/**
 * Where a hazard is. Some sources only pin a hazard's location; others map its outline. Never make up an outline from a
 * point.
 * - point: location only (outline unknown)
 * - polygon: mapped outline, plus its center point when a source provides one (otherwise work it out from the outline)
 */
export type GolfHazardGeometry =
  | { kind: "point"; point: GolfCoordinate; source?: GolfSourceMetadata; verification?: GolfVerification }
  | { kind: "polygon"; polygon: GolfPolygon; center?: GolfCoordinate };

export interface GolfBunker {
  id: string;
  geometry: GolfHazardGeometry;
  /** e.g. "Fairway bunker", "Greenside bunker". */
  label?: string;
}

/** water: lakes, ponds, creeks. penalty_area: marked penalty area that isn't water (desert, ravine). other: anything else. */
export type GolfPenaltyAreaKind = "water" | "penalty_area" | "other";

export interface GolfPenaltyArea {
  id: string;
  kind: GolfPenaltyAreaKind;
  geometry: GolfHazardGeometry;
  label?: string;
}

// ---------------------------------------------------------------------------------------------------------------------
// Hole
// ---------------------------------------------------------------------------------------------------------------------

/** FUTURE: hole height data. Only filled from a source that measured it. */
export interface GolfHoleElevation {
  /** Change in height from the tee to the green, meters (negative = downhill). */
  teeToGreenMeters?: number;
  /** Heights along the hole, e.g. along the centerline from the tee. */
  profile?: { distanceYards: number; altitude: number }[];
  source?: GolfSourceMetadata;
}

export interface GolfHole {
  id: string;
  /** The number on the scorecard. Unusual layouts (e.g. a 9-hole course played twice) are separate holes with their own ids. */
  number: number;
  par: number;
  /** Handicap / stroke index (1 = hardest), if known. */
  strokeIndex?: number;
  externalIds?: GolfExternalId[];

  tees: GolfTee[];
  /** Absent when no green data exists at all (scorecard-only). */
  green?: GolfGreen;
  fairways: GolfFairway[];
  bunkers: GolfBunker[];
  penaltyAreas: GolfPenaltyArea[];

  /** Outline of the whole hole (playing corridor), when mapped. */
  boundary?: GolfPolygon;
  /** Line of play from tee to green, when mapped. */
  centerline?: GolfPolyline;
  elevation?: GolfHoleElevation;

  coverage: GolfDataCoverage;
  verification: GolfVerification;
  sources?: GolfSourceMetadata[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------------------------------------------------

export interface GolfAddress {
  street?: string;
  city?: string;
  /** State / province / region. */
  state?: string;
  /** ISO 3166-1 alpha-2 when known ("US"), otherwise as the source gives it. */
  country?: string;
  postalCode?: string;
}

export type GolfCourseAccess = "public" | "private" | "semi_private" | "resort" | "military";

/** Extra facts about a course. All optional, all only from a source. */
export interface GolfCourseMetadata {
  architect?: string;
  yearOpened?: number;
  access?: GolfCourseAccess;
  website?: string;
  phone?: string;
}

/**
 * One playable course. A facility with several courses (e.g. a 27-hole club with three nines) is several GolfCourse
 * records sharing a `facilityName`.
 */
export interface GolfCourse {
  /** Stable Maroon id. */
  id: string;
  /** Every provider's id for this course — see GolfExternalId. */
  externalIds: GolfExternalId[];
  name: string;
  /** Club / facility the course belongs to, when different from the course name. */
  facilityName?: string;
  address: GolfAddress;
  /** A representative point for the course (clubhouse or middle of the property), for search and maps. */
  location?: GolfCoordinate;
  /** IANA time zone, e.g. "America/Los_Angeles". */
  timezone?: string;

  /** Holes the course has (9, 18, 27, 6…). `holes` may hold fewer when only some are known. */
  holeCount: number;
  holes: GolfHole[];
  teeSets: GolfTeeSet[];
  metadata?: GolfCourseMetadata;

  sources: GolfSourceMetadata[];
  coverage: GolfDataCoverage;
  verification: GolfVerification;
}
