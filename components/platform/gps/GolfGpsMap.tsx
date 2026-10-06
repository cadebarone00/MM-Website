"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { holeCamera, holeFramePoints } from "@/lib/platform/golfGps/holeView";
import { loadGoogleMaps, onGoogleMapsAuthFailure } from "@/lib/platform/golfGps/loadGoogleMaps";
import type { GpsHole, LatLng, PlayerFix } from "@/lib/platform/golfGps/types";
import styles from "./GolfGps.module.css";

const CREAM = "#fbf8f1";
const GOLD = "#dcc495";
const YARDS_TO_METERS = 0.9144;
/**
 * Rotating (vector) maps need a Map ID. Set NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID (Google Cloud → Google Maps Platform → Map
 * management → JavaScript, Vector, tilt + rotation on); until then Google's DEMO_MAP_ID works for development only.
 */
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

/** How much of the map the yardage card (top) and controls (bottom) cover, in pixels. */
export interface MapInsets { top: number; bottom: number }

type Overlay = google.maps.marker.AdvancedMarkerElement | google.maps.Circle | google.maps.Polygon | google.maps.Polyline;
const remove = (overlay: Overlay) => { if (overlay instanceof google.maps.marker.AdvancedMarkerElement) overlay.map = null; else overlay.setMap(null); };

/** A round marker drawn in HTML (Advanced Markers take any element); centered on its point. */
function dot(className: string): HTMLElement {
  const element = document.createElement("div");
  element.className = className;
  return element;
}

/**
 * Satellite map for the GPS screen. Opens in "hole view": turned so the tee is at the bottom and the green at the top,
 * zoomed so the whole hole fits between the yardage card and the bottom controls. It re-frames whenever the hole changes
 * and when Recenter is pressed. Devices that can't draw a rotating map get the same hole north-up instead. Shows the hole
 * (tee, green front / center / back, bunkers, water), the player with an accuracy ring, and the tap-to-measure target.
 * Google's controls are off; its logo and attribution stay visible. Without a key or if loading fails it shows a message;
 * yardages still work.
 */
export function GolfGpsMap({ apiKey, hole, player, target, onTap, recenterToken, focusPlayerToken = 0, insets }: {
  apiKey: string | undefined;
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
  const mapRef = useRef<google.maps.Map | null>(null);
  const libsRef = useRef<Awaited<ReturnType<typeof loadGoogleMaps>> | null>(null);
  const live = useRef<{ player?: google.maps.marker.AdvancedMarkerElement; accuracy?: google.maps.Circle; target?: google.maps.marker.AdvancedMarkerElement; targetLine?: google.maps.Polyline; greenLine?: google.maps.Polyline }>({});
  const onTapRef = useRef(onTap);
  const playerRef = useRef(player);
  /** Which hole view was last framed (hole + Hole view presses + map kind); the camera re-frames only when it changes. */
  const framedFor = useRef("");
  const [ready, setReady] = useState(false);
  const [rendering, setRendering] = useState<"vector" | "raster" | null>(null);
  const [error, setError] = useState<string | null>(apiKey ? null : "missing-key");

  useEffect(() => { onTapRef.current = onTap; }, [onTap]);
  useEffect(() => { playerRef.current = player; }, [player]);

  // Create the map once.
  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    onGoogleMapsAuthFailure(() => { if (!cancelled) setError("load-failed"); });
    loadGoogleMaps(apiKey).then((libs) => {
      if (cancelled || !containerRef.current) return;
      libsRef.current = libs;
      const map = new libs.maps.Map(containerRef.current, {
        mapId: MAP_ID,
        renderingType: google.maps.RenderingType.VECTOR,
        mapTypeId: "satellite",
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: "greedy",
        keyboardShortcuts: false,
        tilt: 0,
        backgroundColor: "#240001",
      });
      map.addListener("click", (event: google.maps.MapMouseEvent) => {
        if (event.latLng) onTapRef.current({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      });
      // Vector (can rotate) or raster (north-up only) is decided by the device; it can arrive a moment after creation.
      const readRendering = () => {
        const type = map.getRenderingType();
        if (type === google.maps.RenderingType.VECTOR) setRendering("vector");
        else if (type === google.maps.RenderingType.RASTER) setRendering("raster");
      };
      map.addListener("renderingtype_changed", readRendering);
      readRendering();
      mapRef.current = map;
      setReady(true);
    }).catch(() => { if (!cancelled) setError("load-failed"); });
    return () => { cancelled = true; };
  }, [apiKey]);

  // Draw the hole; redrawn when the hole changes. Nothing here takes taps, so tapping anywhere measures.
  useEffect(() => {
    const map = mapRef.current, libs = libsRef.current;
    if (!ready || !map || !libs) return;
    const drawn: Overlay[] = [];
    for (const hazard of hole.hazards) {
      const colors = hazard.kind === "water"
        ? { strokeColor: "#4fc3f7", fillColor: "#29b6f6", fillOpacity: 0.35 }
        : { strokeColor: "#f3e2b3", fillColor: "#ead9a8", fillOpacity: 0.55 };
      // A mapped outline is drawn as it is; otherwise a circle of the hazard's rough size.
      drawn.push(hazard.outline
        ? new libs.maps.Polygon({ map, paths: hazard.outline, clickable: false, strokeWeight: 2, ...colors })
        : new libs.maps.Circle({ map, center: hazard.center, radius: hazard.radiusYards * YARDS_TO_METERS, clickable: false, strokeWeight: 2, ...colors }));
    }
    const marker = (position: LatLng, title: string, className: string) =>
      drawn.push(new libs.marker.AdvancedMarkerElement({ map, position, title, content: dot(className), gmpClickable: false }));
    if (hole.teeMapped !== false) marker(hole.tee, "Tee", `${styles.marker} ${styles.markerTee}`);
    marker(hole.green.front, "Green front", `${styles.marker} ${styles.markerEdge}`);
    marker(hole.green.back, "Green back", `${styles.marker} ${styles.markerEdge}`);
    marker(hole.green.center, "Green center", `${styles.marker} ${styles.markerPin}`);
    return () => drawn.forEach(remove);
  }, [ready, hole]);

  // Hole view: the whole hole (holeFramePoints — never the player), tee / hole start at the bottom and green at the top
  // (vector), or the same framing north-up (raster). Returns false when the map can't be framed yet.
  const showHole = useCallback(() => {
    const map = mapRef.current, container = containerRef.current;
    if (!map || !container || !rendering) return false;
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return false;
    if (rendering === "vector") {
      map.moveCamera({ ...holeCamera(hole, { width, height, top: insets.top, bottom: insets.bottom, side: 16 }), tilt: 0 });
    } else {
      const bounds = new google.maps.LatLngBounds();
      holeFramePoints(hole).forEach((point) => bounds.extend(point));
      map.setHeading(0);
      map.fitBounds(bounds, { top: insets.top, bottom: insets.bottom, left: 16, right: 16 });
    }
    container.dataset.camera = "hole";
    container.dataset.holeFrames = String(Number(container.dataset.holeFrames ?? 0) + 1);
    return true;
  }, [hole, rendering, insets.top, insets.bottom]);

  // Frame the hole once per hole (and per Hole view press). Later changes — the yardage card growing or shrinking as
  // hazards and GPS messages update, the player moving — never move the camera.
  useEffect(() => {
    if (!ready) return;
    const key = `${hole.number}|${hole.green.center.lat},${hole.green.center.lng}|${recenterToken}|${rendering}`;
    if (framedFor.current !== key && showHole()) framedFor.current = key;
  }, [ready, showHole, recenterToken, hole, rendering]);

  // Center on me: an explicit tap only. Keeps the zoom and direction; GPS updates afterwards don't follow.
  useEffect(() => {
    const map = mapRef.current, me = playerRef.current, container = containerRef.current;
    if (!focusPlayerToken || !ready || !map || !me || !container) return;
    map.panTo(me);
    container.dataset.camera = "player";
  }, [focusPlayerToken, ready]);

  // The player marker, its accuracy ring, and the thin line to the middle of the green.
  useEffect(() => {
    const map = mapRef.current, libs = libsRef.current;
    if (!ready || !map || !libs) return;
    const o = live.current;
    if (!player) { if (o.player) o.player.map = null; o.accuracy?.setMap(null); o.greenLine?.setMap(null); return; }
    o.player ??= new libs.marker.AdvancedMarkerElement({ title: "You", zIndex: 10, content: dot(`${styles.marker} ${styles.markerPlayer}`), gmpClickable: false });
    o.player.map = map;
    o.player.position = player;
    o.accuracy ??= new libs.maps.Circle({ clickable: false, strokeColor: GOLD, strokeOpacity: 0.6, strokeWeight: 1, fillColor: GOLD, fillOpacity: 0.12 });
    o.accuracy.setMap(player.accuracy ? map : null);
    o.accuracy.setCenter(player);
    o.accuracy.setRadius(player.accuracy ?? 0);
    o.greenLine ??= new libs.maps.Polyline({ clickable: false, strokeColor: CREAM, strokeOpacity: 0.7, strokeWeight: 2 });
    o.greenLine.setMap(map);
    o.greenLine.setPath([player, hole.green.center]);
  }, [ready, player, hole]);

  // The tap-to-measure target and the dashed gold line from the player to it.
  useEffect(() => {
    const map = mapRef.current, libs = libsRef.current;
    if (!ready || !map || !libs) return;
    const o = live.current;
    if (!target) { if (o.target) o.target.map = null; o.targetLine?.setMap(null); return; }
    o.target ??= new libs.marker.AdvancedMarkerElement({ title: "Target", zIndex: 9, content: dot(`${styles.marker} ${styles.markerTarget}`), gmpClickable: false });
    o.target.map = map;
    o.target.position = target;
    o.targetLine ??= new libs.maps.Polyline({ clickable: false, strokeOpacity: 0, strokeWeight: 2,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: GOLD, scale: 3 }, offset: "0", repeat: "12px" }] });
    o.targetLine.setMap(player ? map : null);
    if (player) o.targetLine.setPath([player, target]);
  }, [ready, target, player]);

  return <div className={styles.mapWrap}>
    <div ref={containerRef} className={styles.map} aria-label="Satellite map of the hole, tee at the bottom. Tap to measure." role="application" data-rendering={rendering ?? undefined} />
    {error && <div className={styles.mapMessage} role="status">
      <strong>{error === "missing-key" ? "Map key missing" : "Map couldn't load"}</strong>
      <span>{error === "missing-key"
        ? "Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env, then restart the dev server."
        : "Check the internet connection and that the Google Maps key allows this site."} Yardages still work.</span>
    </div>}
    {!error && !ready && <div className={styles.mapMessage} role="status"><span>Loading satellite map…</span></div>}
  </div>;
}
