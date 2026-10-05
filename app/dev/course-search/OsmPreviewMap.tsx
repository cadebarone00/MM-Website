"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/platform/golfGps/loadGoogleMaps";
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

/**
 * DEV ONLY: OSM geometry drawn over Google satellite imagery, to check the shapes line up. Google is only the
 * background — no geometry here is ever taken from it. North-up raster map; Google's own logo / credits stay visible.
 */
export function OsmPreviewMap({ shapes, attribution }: { shapes: PreviewShape[]; attribution: string }) {
  const container = useRef<HTMLDivElement>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [error, setError] = useState<string | null>(apiKey ? null : "No NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, so the map preview is off.");

  useEffect(() => {
    if (!apiKey || !container.current) return;
    let cancelled = false;
    const drawn: { setMap(map: google.maps.Map | null): void }[] = [];
    loadGoogleMaps(apiKey).then(({ maps }) => {
      if (cancelled || !container.current) return;
      const map = new maps.Map(container.current, { mapTypeId: "satellite", tilt: 0, streetViewControl: false, fullscreenControl: true, mapTypeControl: false });
      const bounds = new google.maps.LatLngBounds();
      for (const shape of shapes) {
        const color = PREVIEW_COLORS[shape.kind];
        const target = shape.kind === "front" || shape.kind === "center" || shape.kind === "back";
        if (shape.point) {
          drawn.push(new maps.Circle({ map, center: shape.point, radius: target ? 1.2 : 3, zIndex: target ? 5 : 1, strokeColor: color, strokeWeight: 2, fillColor: color, fillOpacity: 0.6, clickable: false }));
          bounds.extend(shape.point);
        } else if (shape.path) {
          const common = { map, clickable: false, strokeColor: color, strokeWeight: shape.kind === "boundary" || shape.kind === "approach" ? 3 : 2, zIndex: shape.kind === "approach" ? 4 : 1 };
          drawn.push(shape.closed
            ? new maps.Polygon({ ...common, paths: shape.path, fillColor: color, fillOpacity: shape.kind === "boundary" ? 0 : 0.35 })
            : new maps.Polyline({ ...common, path: shape.path }));
          shape.path.forEach((p) => bounds.extend(p));
        }
      }
      if (!bounds.isEmpty()) map.fitBounds(bounds, 24);
    }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "The map couldn't load."); });
    return () => { cancelled = true; drawn.forEach((shape) => shape.setMap(null)); };
  }, [apiKey, shapes]);

  return <div>
    <div className={styles.legend}>
      {(Object.keys(PREVIEW_COLORS) as PreviewKind[]).map((kind) => <span key={kind}><i style={{ background: PREVIEW_COLORS[kind] }} />{kind}</span>)}
    </div>
    {error ? <p className={styles.error}>{error}</p> : <div ref={container} className={styles.map} aria-label="OSM geometry over satellite imagery" />}
    <p className={styles.credit}>Shapes: {attribution} · Imagery: Google (background only)</p>
  </div>;
}
