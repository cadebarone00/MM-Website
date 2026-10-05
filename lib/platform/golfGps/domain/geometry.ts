import type { GolfSourceMetadata, GolfVerification } from "./provenance";

/**
 * Geographic building blocks for The Maroon's golf-course model. All coordinates are WGS84 degrees (what phones and
 * maps use). Nothing here belongs to any one data provider.
 */

export interface GolfCoordinate {
  lat: number;
  lng: number;
}

/**
 * A coordinate with height. `altitude` is meters above mean sea level, and only set when a source actually measured it —
 * never estimated. Because it extends GolfCoordinate, a 3D point can be used anywhere a 2D one is expected.
 */
export interface GolfCoordinate3D extends GolfCoordinate {
  altitude: number;
}

/**
 * An outline on the ground (a green, a bunker, a fairway, a hole boundary). `coordinates` is the outer ring in order,
 * WITHOUT repeating the first point at the end; adapters close or open rings as a map library needs. Points may be
 * GolfCoordinate3D when the source has heights.
 */
export interface GolfPolygon {
  coordinates: GolfCoordinate[];
  /** Cut-outs inside the outline (e.g. bunkers inside a fairway), same ring rules as `coordinates`. */
  innerRings?: GolfCoordinate[][];
  /** Where this shape came from, when it differs from (or is more specific than) its hole / course. */
  source?: GolfSourceMetadata;
  verification?: GolfVerification;
}

/** An ordered line on the ground, e.g. a hole's centerline from tee to green. Same coordinate rules as GolfPolygon. */
export interface GolfPolyline {
  coordinates: GolfCoordinate[];
  source?: GolfSourceMetadata;
  verification?: GolfVerification;
}
