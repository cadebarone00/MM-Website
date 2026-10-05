/**
 * Overpass API reply shapes — ONLY the fields The Maroon reads (`out tags geom`). The client validates replies into
 * these; nothing outside ./openStreetMap/ may import them.
 */

export interface OsmPoint {
  lat: number;
  lon: number;
}

export type OsmElementType = "node" | "way" | "relation";

/** A relation member. With `out geom`, way members carry their own point list. */
export interface OsmMember {
  type: OsmElementType;
  ref: number;
  role: string;
  /** Null when Overpass sent a member geometry with missing / clipped points — that member can't be used. */
  geometry: OsmPoint[] | null;
}

export interface OsmElement {
  type: OsmElementType;
  id: number;
  tags: Record<string, string>;
  /** Nodes only. */
  point?: OsmPoint;
  /** Ways only: points in order. Null when any point was missing or clipped. */
  geometry?: OsmPoint[] | null;
  /** Relations only. */
  members?: OsmMember[];
}
