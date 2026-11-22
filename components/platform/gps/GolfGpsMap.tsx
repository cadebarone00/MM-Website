"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { moveAlong } from "@/lib/platform/golfGps/distance";
import { holeCamera } from "@/lib/platform/golfGps/holeView";
import type { GpsHole, LatLng, PlayerFix } from "@/lib/platform/golfGps/types";
import { usgsSatelliteStyle } from "@/lib/platform/golfGps/usgsImagery";
import styles from "./GolfGps.module.css";

const CREAM = "#fbf8f1";
const GOLD = "#dcc495";
const METERS_PER_YARD = 0.9144;
/** holeCamera() gives Google-style zoom (256px world); MapLibre's world is 512px, so its zoom is one less. */
const MAPLIBRE_ZOOM_OFFSET = -1;

/** How much of the map the yardage card (top) and controls (bottom) cover, in pixels. */
export interface MapInsets { top: number; bottom: number }

type Feature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, string>>;
const collection = (features: Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const lngLat = (point: LatLng): [number, number] => [point.lng, point.lat];
const ring = (points: LatLng[]) => { const coords = points.map(lngLat); return [...coords, coords[0]]; };
/** A circle as a polygon (MapLibre draws shapes, not true circles), `meters` from the center. */
const circle = (center: LatLng, meters: number) =>
  ring(Array.from({ length: 48 }, (_, i) => moveAlong(center, (i / 48) * 360, meters / METERS_PER_YARD)));

/** A round marker drawn in HTML, centered on its point. Taps go through it to the map. */
function dot(className: string, title: string): HTMLElement {
  const element = document.createElement("div");
  element.className = className;
  element.title = title;
  return element;
}

/**
 * Satellite map for the GPS screen, drawn with MapLibre (free, open source) over free USGS aerial photos (US only — see
 * lib/platform/golfGps/usgsImagery.ts). Opens in "hole view": turned so the tee is at the bottom and the green at the
 * top, zoomed so the whole hole fits between the yardage card and the bottom controls. It re-frames whenever the hole
 * changes and when Hole view is pressed. Shows the hole (tee, green front / center / back, bunkers, water), the player
 * with an accuracy ring, and the tap-to-measure target. The USGS credit stays visible. If the map can't start (no WebGL,
 * no connection) it shows a message; yardages still work.
 */
export function GolfGpsMap({ hole, player, target, onTap, recenterToken, focusPlayerToken = 0, insets }: {
  hole: GpsHole;
  player: PlayerFix | null;
  target: LatLng | null;
  onTap: (point: LatLng) => void;
  /** Bumped by the Hole view button: frame the whole hole again. */
  recenterToken: number;
  /** Bumped by the Center on me button: pan to the player (only then — the camera never follows GPS on its own). */
  focusPlayerToken?: number;
  insets: MapInsets;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerClassRef = useRef<typeof Marker | null>(null);
  const live = useRef<{ player?: Marker; target?: Marker }>({});
  const onTapRef = useRef(onTap);
  const playerRef = useRef(player);
  /** Which hole view was last framed (hole + Hole view presses); the camera re-frames only when it changes. */
  const framedFor = useRef("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => { onTapRef.current = onTap; }, [onTap]);
  useEffect(() => { playerRef.current = player; }, [player]);

  // Create the map once (MapLibre is loaded only in the browser, only when the GPS screen opens).
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let created: MapLibreMap | null = null;
    import("maplibre-gl").then(({ Map, Marker }) => {
      if (cancelled || !containerRef.current) return;
      markerClassRef.current = Marker;
      const map = created = new Map({
        container: containerRef.current,
        style: usgsSatelliteStyle(),
        attributionControl: { compact: false },
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        keyboard: false,
        renderWorldCopies: false,
      });
      map.on("click", (event) => onTapRef.current({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
      map.on("load", () => {
        if (cancelled) return;
        const empty = collection([]);
        for (const id of ["hazards", "accuracy", "lines"]) map.addSource(id, { type: "geojson", data: empty });
        map.addLayer({ id: "hazard-fill", type: "fill", source: "hazards", paint: {
          "fill-color": ["match", ["get", "kind"], "water", "#29b6f6", "#ead9a8"],
          "fill-opacity": ["match", ["get", "kind"], "water", 0.35, 0.55] } });
        map.addLayer({ id: "hazard-line", type: "line", source: "hazards", paint: {
          "line-color": ["match", ["get", "kind"], "water", "#4fc3f7", "#f3e2b3"], "line-width": 2 } });
        map.addLayer({ id: "accuracy-fill", type: "fill", source: "accuracy", paint: { "fill-color": GOLD, "fill-opacity": 0.12 } });
        map.addLayer({ id: "accuracy-line", type: "line", source: "accuracy", paint: { "line-color": GOLD, "line-opacity": 0.6, "line-width": 1 } });
        map.addLayer({ id: "green-line", type: "line", source: "lines", filter: ["==", ["get", "kind"], "green"],
          paint: { "line-color": CREAM, "line-opacity": 0.7, "line-width": 2 } });
        map.addLayer({ id: "target-line", type: "line", source: "lines", filter: ["==", ["get", "kind"], "target"],
          paint: { "line-color": GOLD, "line-width": 2, "line-dasharray": [2, 2] } });
        mapRef.current = map;
        setReady(true);
      });
    }).catch(() => { if (!cancelled) setError(true); });
    return () => {
      cancelled = true;
      created?.remove();
      mapRef.current = null;
      live.current = {};
    };
  }, []);

  // Draw the hole; redrawn when the hole changes. Nothing here takes taps, so tapping anywhere measures.
  useEffect(() => {
    const map = mapRef.current, MarkerClass = markerClassRef.current;
    if (!ready || !map || !MarkerClass) return;
    (map.getSource("hazards") as GeoJSONSource).setData(collection(hole.hazards.map((hazard): Feature => ({
      type: "Feature", properties: { kind: hazard.kind },
      // A mapped outline is drawn as it is; otherwise a circle of the hazard's rough size.
      geometry: { type: "Polygon", coordinates: [hazard.outline ? ring(hazard.outline) : circle(hazard.center, hazard.radiusYards * METERS_PER_YARD)] },
    }))));
    const markers: Marker[] = [];
    const marker = (position: LatLng, title: string, className: string) =>
      markers.push(new MarkerClass({ element: dot(className, title), anchor: "center" }).setLngLat(lngLat(position)).addTo(map));
    if (hole.teeMapped !== false) marker(hole.tee, "Tee", `${styles.marker} ${styles.markerTee}`);
    marker(hole.green.front, "Green front", `${styles.marker} ${styles.markerEdge}`);
    marker(hole.green.back, "Green back", `${styles.marker} ${styles.markerEdge}`);
    marker(hole.green.center, "Green center", `${styles.marker} ${styles.markerPin}`);
    return () => markers.forEach((m) => m.remove());
  }, [ready, hole]);

  // Hole view: the whole hole (never the player), tee / hole start at the bottom and green at the top. Returns false when
  // the map can't be framed yet.
  const showHole = useCallback(() => {
    const map = mapRef.current, container = containerRef.current;
    if (!map || !container) return false;
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return false;
    const camera = holeCamera(hole, { width, height, top: insets.top, bottom: insets.bottom, side: 16 });
    map.jumpTo({ center: lngLat(camera.center), bearing: camera.heading, zoom: camera.zoom + MAPLIBRE_ZOOM_OFFSET, pitch: 0 });
    container.dataset.camera = "hole";
    container.dataset.holeFrames = String(Number(container.dataset.holeFrames ?? 0) + 1);
    return true;
  }, [hole, insets.top, insets.bottom]);

  // Frame the hole once per hole (and per Hole view press). Later changes — the yardage card growing or shrinking as
  // hazards and GPS messages update, the player moving — never move the camera.
  useEffect(() => {
    if (!ready) return;
    const key = `${hole.number}|${hole.green.center.lat},${hole.green.center.lng}|${recenterToken}`;
    if (framedFor.current !== key && showHole()) framedFor.current = key;
  }, [ready, showHole, recenterToken, hole]);

  // Center on me: an explicit tap only. Keeps the zoom and direction; GPS updates afterwards don't follow.
  useEffect(() => {
    const map = mapRef.current, me = playerRef.current, container = containerRef.current;
    if (!focusPlayerToken || !ready || !map || !me || !container) return;
    map.panTo(lngLat(me));
    container.dataset.camera = "player";
  }, [focusPlayerToken, ready]);

  // The player marker, its accuracy ring, the thin line to the middle of the green, and the dashed gold line to the target.
  useEffect(() => {
    const map = mapRef.current, MarkerClass = markerClassRef.current;
    if (!ready || !map || !MarkerClass) return;
    const o = live.current;
    if (player) {
      o.player ??= new MarkerClass({ element: dot(`${styles.marker} ${styles.markerPlayer}`, "You"), anchor: "center" });
      o.player.setLngLat(lngLat(player)).addTo(map);
    } else o.player?.remove();
    if (target) {
      o.target ??= new MarkerClass({ element: dot(`${styles.marker} ${styles.markerTarget}`, "Target"), anchor: "center" });
      o.target.setLngLat(lngLat(target)).addTo(map);
    } else o.target?.remove();
    (map.getSource("accuracy") as GeoJSONSource).setData(collection(player?.accuracy
      ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circle(player, player.accuracy)] } }] : []));
    const lines: Feature[] = [];
    if (player) lines.push({ type: "Feature", properties: { kind: "green" }, geometry: { type: "LineString", coordinates: [lngLat(player), lngLat(hole.green.center)] } });
    if (player && target) lines.push({ type: "Feature", properties: { kind: "target" }, geometry: { type: "LineString", coordinates: [lngLat(player), lngLat(target)] } });
    (map.getSource("lines") as GeoJSONSource).setData(collection(lines));
  }, [ready, player, target, hole]);

  return <div className={styles.mapWrap}>
    <div ref={containerRef} className={styles.map} aria-label="Satellite map of the hole, tee at the bottom. Tap to measure." role="application" />
    {error && <div className={styles.mapMessage} role="status">
      <strong>Map couldn&apos;t load</strong>
      <span>Check the internet connection and try again. Yardages still work.</span>
    </div>}
    {!error && !ready && <div className={styles.mapMessage} role="status"><span>Loading satellite map…</span></div>}
  </div>;
}
