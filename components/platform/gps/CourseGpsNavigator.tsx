"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { GolfGpsScreen } from "./GolfGpsScreen";
import type { GpsCourse } from "@/lib/platform/golfGps/types";

/**
 * A real course in the GPS screen with Previous / Next hole (and a close button when `onClose` is given). Steps through
 * every scorecard hole; a hole without playable green targets shows the screen's own "No map for Hole N yet" message.
 * Fills its parent — the caller decides the size (full page in /dev/gps, a full-screen layer in Explore).
 */
export function CourseGpsNavigator({ course, holeNumbers, initialHole, onClose }: {
  course: GpsCourse;
  holeNumbers: number[];
  initialHole?: number;
  onClose?: () => void;
}) {
  const numbers = holeNumbers.length ? holeNumbers : course.holes.map((hole) => hole.number);
  const [index, setIndex] = useState(Math.max(0, numbers.indexOf(initialHole ?? course.holes[0].number)));
  const number = numbers[index];
  const playable = course.holes.some((hole) => hole.number === number);
  const step = (by: number) => setIndex((current) => (current + by + numbers.length) % numbers.length);
  const button = { background: "#3a0410", color: "#fbf8f1", border: 0, borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "center", gap: 2, cursor: "pointer" } as const;
  return <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#240001" }}>
    <nav aria-label="Hole" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", color: "#fbf8f1", font: "600 14px system-ui" }}>
      <span style={{ display: "flex", gap: 6 }}>
        {onClose && <button type="button" style={button} onClick={onClose} aria-label="Close GPS"><X size={18} aria-hidden /></button>}
        <button type="button" style={button} onClick={() => step(-1)} aria-label="Previous hole"><ChevronLeft size={18} aria-hidden />Prev</button>
      </span>
      <span style={{ textAlign: "center" }}>Hole {number}{playable ? "" : " · no GPS targets"}<br /><small style={{ fontWeight: 400, opacity: 0.7 }}>{course.name}</small></span>
      <button type="button" style={button} onClick={() => step(1)} aria-label="Next hole">Next<ChevronRight size={18} aria-hidden /></button>
    </nav>
    <div style={{ flex: 1, minHeight: 0 }}>
      <GolfGpsScreen course={course} holeNumber={number} />
    </div>
  </div>;
}
