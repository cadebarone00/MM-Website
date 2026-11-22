"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { loadMapLibre } from "@/lib/platform/golfGps/loadMapLibre";
import { usgsSatelliteStyle } from "@/lib/platform/golfGps/usgsImagery";
import styles from "./CourseSearch.module.css";

export type PreviewKind = "boundary" | "centerline" | "green" | "tee" | "fairway" | "bunker" | "water" | "penalty" | "unassigned"
  | "approach" | "front" | "center" | "back";

/** One shape to draw, already converted from Maroon geometry on the server (no OSM data reaches the browser raw). */
export interface PreviewShape {
  kind: PreviewKind;
  label: string;
  /** Outline (closed) or line (open). */
  path?: { lat: number; lng: number }[];
  closed?: boolean;
  point?: { lat: number; lng: number };
}

export const PREVIEW_COLORS: Record<PreviewKind, string> = {
  boundary: "#ffffff", centerline: "#ffd400", green: "#39e75f", tee: "#3d8bff", fairway: "#a6f28a",
  bunker: "#f2dfa0", water: "#1ec8ff", penalty: "#ff4d4d", unassigned: "#ff3df5",
  approach: "#ff8a00", front: "#ffffff", center: "#e0002a", back: "#111111",
};

const TARGETS = new Set<PreviewKind>(["front", "center", "back"]);

/**
 * DEV ONLY: OSM geometry drawn over USGS aerial photos (MapLibre), to check the shapes line up. The photos are only the
 * background — no geometry here is ever taken from them. North-up map; the USGS credit stays visible.
 */
export function OsmPreviewMap({ shapes, attribution }: { shapes: PreviewShape[]; attribution: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!container.current) return;
    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;
    loadMapLibre().then(({ Map, LngLatBounds }) => {
      if (cancelled || !container.current) return;
      map = new Map({ container: container.current, style: usgsSatelliteStyle("#1d2128"), dragRotate: false, touchPitch: false, maxPitch: 0 });
      const features: GeoJSON.Feature[] = shapes.flatMap((shape): GeoJSON.Feature[] => {
        const properties = { color: PREVIEW_COLORS[shape.kind], kind: shape.kind, wide: shape.kind === "boundary" || shape.kind === "approach" ? 1 : 0,
          fill: shape.kind === "boundary" ? 0 : 0.35, radius: TARGETS.has(shape.kind) ? 4 : 6 };
        if (shape.point) return [{ type: "Feature", properties, geometry: { type: "Point", coordinates: [shape.point.lng, shape.point.lat] } }];
        if (!shape.path?.length) return [];
        const coords = shape.path.map((p) => [p.lng, p.lat]);
        return [{ type: "Feature", properties, geometry: shape.closed ? { type: "Polygon", coordinates: [[...coords, coords[0]]] } : { type: "LineString", coordinates: coords } }];
      });
      map.on("load", () => {
        if (cancelled || !map) return;
        map.addSource("shapes", { type: "geojson", data: { type: "FeatureCollection", features } });
        map.addLayer({ id: "fill", type: "fill", source: "shapes", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "fill"] } });
        map.addLayer({ id: "line", type: "line", source: "shapes", filter: ["!=", ["geometry-type"], "Point"],
          paint: { "line-color": ["get", "color"], "line-width": ["case", ["==", ["get", "wide"], 1], 3, 2] } });
        map.addLayer({ id: "point", type: "circle", source: "shapes", filter: ["==", ["geometry-type"], "Point"],
          paint: { "circle-color": ["get", "color"], "circle-radius": ["get", "radius"], "circle-opacity": 0.8, "circle-stroke-color": "#000", "circle-stroke-width": 1 } });
      });
      const bounds = new LngLatBounds();
      for (const shape of shapes) for (const p of shape.point ? [shape.point] : shape.path ?? []) bounds.extend([p.lng, p.lat]);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 24, animate: false });
    }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "The map couldn't load."); });
    return () => { cancelled = true; map?.remove(); };
  }, [shapes]);

  return <div>
    <div className={styles.legend}>
      {(Object.keys(PREVIEW_COLORS) as PreviewKind[]).map((kind) => <span key={kind}><i style={{ background: PREVIEW_COLORS[kind] }} />{kind}</span>)}
    </div>
    {error ? <p className={styles.error}>{error}</p> : <div ref={container} className={styles.map} aria-label="OSM geometry over satellite imagery" />}
    <p className={styles.credit}>Shapes: {attribution} · Imagery: USGS The National Map (background only)</p>
  </div>;
}
