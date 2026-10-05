import type { GolfCoordinate, GolfCourse, GolfDataProvider, GolfExternalId } from "../domain";

/**
 * What every golf-course data provider (OpenGolfAPI now; OpenStreetMap, paid providers later) offers The Maroon.
 * Implementations live in ./<provider>/ and return only Maroon types — never the provider's raw JSON. Server-only.
 */

export interface GolfCourseSearchQuery {
  /** Course or club name, e.g. "Pinehurst". */
  text: string;
  /** Two-letter US state to narrow the search, when the provider supports it. */
  state?: string;
  limit?: number;
}

/** One search hit: just enough to show in a list and fetch the full course. */
export interface GolfCourseSearchResult {
  externalId: GolfExternalId;
  name: string;
  city?: string;
  state?: string;
  location?: GolfCoordinate;
  par?: number;
}

export interface GolfCourseSearchResponse {
  results: GolfCourseSearchResult[];
  /** How many courses matched in total (may be more than `results`), when the provider says. */
  total?: number;
  /** Credit line the UI must show next to these results. */
  attribution: string;
}

/** A normalized course plus plain-English notes about provider data that was odd, inconsistent or skipped. */
export interface GolfCourseImport {
  course: GolfCourse;
  notes: string[];
}

export interface GolfCourseProvider {
  provider: GolfDataProvider;
  searchCourses(query: GolfCourseSearchQuery): Promise<GolfCourseSearchResponse>;
  /** Null when the provider has no course with this id. */
  getCourseDetail(externalId: string): Promise<GolfCourseImport | null>;
}

/**
 * Why a provider call failed, so callers can show the right message:
 * bad_request (our input was invalid) · timeout · network · rate_limited · http (any other non-OK status) ·
 * malformed (the reply wasn't the shape we expect).
 */
export type GolfProviderErrorKind = "bad_request" | "timeout" | "network" | "rate_limited" | "http" | "malformed";

export class GolfProviderError extends Error {
  constructor(readonly provider: GolfDataProvider, readonly kind: GolfProviderErrorKind, message: string, readonly status?: number) {
    super(message);
    this.name = "GolfProviderError";
  }
}
