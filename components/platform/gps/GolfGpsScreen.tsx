"use client";

import { useEffect, useRef, useState } from "react";
import { Flag } from "lucide-react";
import { distanceToHazardYards, distanceYards } from "@/lib/platform/golfGps/distance";
import { MISSION_HILLS_PETE_DYE } from "@/lib/platform/golfGps/missionHillsPeteDye";
import type { GpsCourse, GpsHazard, GpsStatus, LatLng, PlayerFix } from "@/lib/platform/golfGps/types";
import { usePlayerLocation } from "@/lib/platform/golfGps/usePlayerLocation";
import { useSimulatorGps } from "@/components/dev/useSimulatorGps";
import { GolfGpsHud } from "./GolfGpsHud";
import { GolfGpsMap, type MapInsets } from "./GolfGpsMap";
import styles from "./GolfGps.module.css";

/** Farther than this from the green, the player clearly isn't on this hole (real GPS at home, say). */
const FAR_YARDS = 2000;
/** Breathing room between the hole and the cards that cover the map. */
const INSET_GAP = 12;
/** Google's logo and terms along the bottom edge. */
const ATTRIBUTION_HEIGHT = 30;

/**
 * The on-course GPS screen: satellite map in "hole view" (tee at the bottom, green at the top) with the yardage card on
 * top, Hole view (recenter) and tap-to-measure. Used full screen at /dev/gps and inside the Scoring sheet's GPS view, where
 * `holeNumber` follows the scorecard's current hole and the map re-frames when it changes. The Real / Mock GPS test
 * controls live in the /dev simulator's side panel (GPS test), never on the phone screen. Prototype: the course is Mission
 * Hills' Pete Dye Challenge Course, where OpenStreetMap only maps hole 6, so other hole numbers show hole 6 with a note.
 * Without `holeNumber` (the /dev/gps page) it opens on the course's first mapped hole.
 */
export function GolfGpsScreen({ holeNumber, course = MISSION_HILLS_PETE_DYE, className = "" }: {
  holeNumber?: number;
  course?: GpsCourse;
  className?: string;
}) {
  const mapped = holeNumber === undefined ? course.holes[0] : course.holes.find((candidate) => candidate.number === holeNumber);
  const hole = mapped ?? course.holes[0];
  // Mock GPS starts the player on the tee of the hole on screen.
  const { mode, setMode, status, fix, moveMock, resetMock } = usePlayerLocation(hole.tee);
  const [target, setTarget] = useState<LatLng | null>(null);
  useSimulatorGps({ mode, setMode, fix, moveMock, resetMock: () => { resetMock(); setTarget(null); } });
  const [recenterToken, setRecenterToken] = useState(0);
  const [insets, setInsets] = useState<MapInsets>({ top: 250, bottom: ATTRIBUTION_HEIGHT });
  const screenRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Keep measuring what the yardage card covers, so the hole view always fits the clear space under it.
  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    const measure = () => {
      const box = screen.getBoundingClientRect();
      const top = topRef.current ? topRef.current.getBoundingClientRect().bottom - box.top + INSET_GAP : INSET_GAP;
      setInsets((current) => Math.abs(current.top - top) < 2 ? current : { top: Math.round(top), bottom: ATTRIBUTION_HEIGHT });
    };
    const observer = new ResizeObserver(measure);
    [screen, topRef.current].forEach((element) => element && observer.observe(element));
    measure();
    return () => observer.disconnect();
  }, []);

  // A new hole clears the old hole's measure target.
  const [targetHole, setTargetHole] = useState(hole.number);
  if (targetHole !== hole.number) { setTargetHole(hole.number); setTarget(null); }

  // Miles away (real GPS at home, say), the yardages would be huge numbers; show dashes and say how far instead.
  const center = fix ? distanceYards(fix, hole.green.center) : null;
  const far = fix?.source === "real" && center !== null && center > FAR_YARDS;
  const yards = (point: LatLng) => fix && !far ? distanceYards(fix, point) : null;
  const notice = mapped ? gpsNotice(status, fix, center) : `No map for Hole ${holeNumber} yet — showing Hole ${hole.number}.`;

  return <div ref={screenRef} className={`${styles.screen} ${className}`}>
    <GolfGpsMap apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} hole={hole} player={fix} target={target} onTap={setTarget} recenterToken={recenterToken} insets={insets} />
    <GolfGpsHud ref={topRef} hole={hole} front={yards(hole.green.front)} center={yards(hole.green.center)} back={yards(hole.green.back)}
      hazards={hudHazards(hole.hazards, fix && !far ? fix : null)}
      target={target ? yards(target) : null} notice={notice} />
    <button type="button" className={styles.recenter} style={{ bottom: insets.bottom + 4 }} aria-label="Back to hole view"
      onClick={() => setRecenterToken((token) => token + 1)}>
      <Flag size={20} aria-hidden />
    </button>
    {/* OpenStreetMap's licence (ODbL) requires crediting it wherever its hole data shows. */}
    <span className={styles.dataCredit} style={{ bottom: insets.bottom + 4 }}>Hole data © OpenStreetMap contributors</span>
  </div>;
}

/** At most this many hazards on the card; a fully mapped hole can have 15+ bunkers. */
const MAX_HUD_HAZARDS = 4;

/**
 * Hazard rows for the card: yards to each hazard's nearest edge (mapped outline) or middle (no outline). When a hole has
 * more than fit, the nearest ones are shown; otherwise they keep the hole's own order.
 */
function hudHazards(hazards: GpsHazard[], from: LatLng | null) {
  const rows = hazards.map((hazard) => ({ id: hazard.id, label: hazard.label, yards: from ? distanceToHazardYards(from, hazard) : null }));
  if (rows.length <= MAX_HUD_HAZARDS || !from) return rows.slice(0, MAX_HUD_HAZARDS);
  return [...rows].sort((a, b) => a.yards! - b.yards!).slice(0, MAX_HUD_HAZARDS);
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
