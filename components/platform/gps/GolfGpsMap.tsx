"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, onGoogleMapsAuthFailure } from "@/lib/platform/golfGps/loadGoogleMaps";
import type { GpsHole, LatLng, PlayerFix } from "@/lib/platform/golfGps/types";
import styles from "./GolfGps.module.css";

const MAROON = "#6b161a";
const CREAM = "#fbf8f1";
const GOLD = "#dcc495";
const YARDS_TO_METERS = 0.9144;

/**
 * Satellite map for the GPS screen: the hole (tee, green front / center / back, bunkers, water), the player with an
 * accuracy ring, and the tap-to-measure target with a line from the player. Google's controls are off; its logo and
 * attribution stay visible. If there's no key or the map can't load it shows a message instead; yardages still work.
 */
export function GolfGpsMap({ apiKey, hole, player, target, onTap, recenterToken }: {
  apiKey: string | undefined;
  hole: GpsHole;
  player: PlayerFix | null;
  target: LatLng | null;
  onTap: (point: LatLng) => void;
  /** Bumped by the Recenter button: pans the map back to the player. */
  recenterToken: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const libsRef = useRef<Awaited<ReturnType<typeof loadGoogleMaps>> | null>(null);
  const overlays = useRef<{ player?: google.maps.Marker; accuracy?: google.maps.Circle; target?: google.maps.Marker; targetLine?: google.maps.Polyline; greenLine?: google.maps.Polyline }>({});
  const onTapRef = useRef(onTap);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(apiKey ? null : "missing-key");

  useEffect(() => { onTapRef.current = onTap; }, [onTap]);

  // Load Google Maps and draw the hole once.
  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    onGoogleMapsAuthFailure(() => { if (!cancelled) setError("load-failed"); });
    loadGoogleMaps(apiKey).then((libs) => {
      if (cancelled || !containerRef.current) return;
      libsRef.current = libs;
      const map = new libs.maps.Map(containerRef.current, {
        mapTypeId: "satellite",
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: "greedy",
        keyboardShortcuts: false,
        tilt: 0,
        backgroundColor: "#240001",
      });
      const bounds = new google.maps.LatLngBounds();
      [hole.tee, hole.green.back, hole.green.front].forEach((point) => bounds.extend(point));
      // Leave room for the yardage card on top and the dev controls at the bottom, so the hole fills the clear middle.
      map.fitBounds(bounds, { top: 250, bottom: 170, left: 16, right: 16 });
      map.addListener("click", (event: google.maps.MapMouseEvent) => {
        if (event.latLng) onTapRef.current({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      });

      // The hole: hazards first so markers sit on top. None of these take taps, so tapping anywhere measures.
      for (const hazard of hole.hazards) {
        if (hazard.kind === "water" && hazard.outline) {
          new libs.maps.Polygon({ map, paths: hazard.outline, clickable: false, strokeColor: "#4fc3f7", strokeWeight: 2, fillColor: "#29b6f6", fillOpacity: 0.35 });
        } else {
          new libs.maps.Circle({ map, center: hazard.center, radius: hazard.radiusYards * YARDS_TO_METERS, clickable: false, strokeColor: "#f3e2b3", strokeWeight: 2, fillColor: "#ead9a8", fillOpacity: 0.55 });
        }
      }
      const dot = (position: LatLng, title: string, scale: number, fill: string, stroke: string) => new libs.marker.Marker({
        map, position, title, clickable: false,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale, fillColor: fill, fillOpacity: 1, strokeColor: stroke, strokeWeight: 2 },
      });
      dot(hole.tee, "Tee", 6, CREAM, MAROON);
      dot(hole.green.front, "Green front", 4, CREAM, MAROON);
      dot(hole.green.back, "Green back", 4, CREAM, MAROON);
      dot(hole.green.center, "Green center", 7, GOLD, MAROON);
      mapRef.current = map;
      setReady(true);
    }).catch(() => { if (!cancelled) setError("load-failed"); });
    return () => { cancelled = true; };
  }, [apiKey, hole]);

  // The player marker, its accuracy ring, and the thin line to the middle of the green.
  useEffect(() => {
    const map = mapRef.current, libs = libsRef.current;
    if (!ready || !map || !libs) return;
    const o = overlays.current;
    if (!player) { o.player?.setMap(null); o.accuracy?.setMap(null); o.greenLine?.setMap(null); return; }
    o.player ??= new libs.marker.Marker({ map, clickable: false, zIndex: 10, title: "You",
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: MAROON, fillOpacity: 1, strokeColor: CREAM, strokeWeight: 3 } });
    o.player.setMap(map);
    o.player.setPosition(player);
    o.accuracy ??= new libs.maps.Circle({ map, clickable: false, strokeColor: GOLD, strokeOpacity: 0.6, strokeWeight: 1, fillColor: GOLD, fillOpacity: 0.12 });
    o.accuracy.setMap(player.accuracy ? map : null);
    o.accuracy.setCenter(player);
    o.accuracy.setRadius(player.accuracy ?? 0);
    o.greenLine ??= new libs.maps.Polyline({ map, clickable: false, strokeColor: CREAM, strokeOpacity: 0.7, strokeWeight: 2 });
    o.greenLine.setMap(map);
    o.greenLine.setPath([player, hole.green.center]);
  }, [ready, player, hole]);

  // The tap-to-measure target and the dashed gold line from the player to it.
  useEffect(() => {
    const map = mapRef.current, libs = libsRef.current;
    if (!ready || !map || !libs) return;
    const o = overlays.current;
    if (!target) { o.target?.setMap(null); o.targetLine?.setMap(null); return; }
    o.target ??= new libs.marker.Marker({ map, clickable: false, zIndex: 9, title: "Target",
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: GOLD, fillOpacity: 1, strokeColor: "#240001", strokeWeight: 3 } });
    o.target.setMap(map);
    o.target.setPosition(target);
    o.targetLine ??= new libs.maps.Polyline({ map, clickable: false, strokeOpacity: 0, strokeWeight: 2,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: GOLD, scale: 3 }, offset: "0", repeat: "12px" }] });
    o.targetLine.setMap(player ? map : null);
    if (player) o.targetLine.setPath([player, target]);
  }, [ready, target, player]);

  // Recenter on the player.
  useEffect(() => {
    if (recenterToken === 0 || !mapRef.current || !player) return;
    mapRef.current.panTo(player);
    if ((mapRef.current.getZoom() ?? 0) < 17) mapRef.current.setZoom(18);
    // Only a new button press should recenter, not every player move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterToken]);

  return <div className={styles.mapWrap}>
    <div ref={containerRef} className={styles.map} aria-label="Satellite map of the hole. Tap to measure." role="application" />
    {error && <div className={styles.mapMessage} role="status">
      <strong>{error === "missing-key" ? "Map key missing" : "Map couldn't load"}</strong>
      <span>{error === "missing-key"
        ? "Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env, then restart the dev server."
        : "Check the internet connection and that the Google Maps key allows this site."} Yardages still work.</span>
    </div>}
    {!error && !ready && <div className={styles.mapMessage} role="status"><span>Loading satellite map…</span></div>}
  </div>;
}
