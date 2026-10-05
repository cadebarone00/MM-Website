"use client";

import { useState } from "react";
import { LocateFixed } from "lucide-react";
import { distanceYards } from "@/lib/platform/golfGps/distance";
import { MOCK_HOLE, MOCK_START } from "@/lib/platform/golfGps/mockCourse";
import type { GpsStatus, LatLng, PlayerFix } from "@/lib/platform/golfGps/types";
import { usePlayerLocation } from "@/lib/platform/golfGps/usePlayerLocation";
import { GolfGpsHud } from "./GolfGpsHud";
import { GolfGpsMap } from "./GolfGpsMap";
import { GpsDevControls } from "./GpsDevControls";
import styles from "./GolfGps.module.css";

/** Farther than this from the green, the player clearly isn't on this hole (real GPS at home, say). */
const FAR_YARDS = 2000;

/**
 * The on-course GPS screen: satellite map with the yardage card on top, Recenter, tap-to-measure, and (dev only) the
 * Real / Mock GPS controls. Used full screen at /dev/gps and inside the Scoring sheet's GPS view. Prototype: one mock hole.
 */
export function GolfGpsScreen({ showDevControls = false, className = "" }: { showDevControls?: boolean; className?: string }) {
  const hole = MOCK_HOLE;
  const { mode, setMode, status, fix, moveMock, resetMock } = usePlayerLocation(MOCK_START);
  const [target, setTarget] = useState<LatLng | null>(null);
  const [recenterToken, setRecenterToken] = useState(0);

  const yards = (point: LatLng) => fix ? distanceYards(fix, point) : null;
  const center = yards(hole.green.center);

  return <div className={`${styles.screen} ${className}`}>
    <GolfGpsMap apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} hole={hole} player={fix} target={target} onTap={setTarget} recenterToken={recenterToken} />
    <GolfGpsHud hole={hole} front={yards(hole.green.front)} center={center} back={yards(hole.green.back)}
      hazards={hole.hazards.map((hazard) => ({ id: hazard.id, label: hazard.label, yards: yards(hazard.center) }))}
      target={target ? yards(target) : null} notice={gpsNotice(status, fix, center)} />
    <button type="button" className={styles.recenter} aria-label="Recenter on me" disabled={!fix} onClick={() => setRecenterToken((token) => token + 1)}>
      <LocateFixed size={22} aria-hidden />
    </button>
    {showDevControls && <GpsDevControls mode={mode} onMode={setMode} fix={fix} onMove={moveMock} onReset={() => { resetMock(); setTarget(null); }} />}
  </div>;
}

/** The one-line GPS message under the yardages, or null when everything's normal. */
function gpsNotice(status: GpsStatus, fix: PlayerFix | null, center: number | null): string | null {
  if (status === "unsupported") return "This device can't share its location — using Mock GPS.";
  if (status === "denied") return "Location is blocked — using Mock GPS. Allow location for this site to use Real GPS.";
  if (status === "unavailable") return "GPS signal unavailable — using Mock GPS.";
  if (status === "locating" && !fix) return "Finding you…";
  if (fix?.source === "real" && center !== null && center > FAR_YARDS) return `You're about ${(center / 1760).toFixed(1)} miles from this hole.`;
  return null;
}
