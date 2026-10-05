"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GolfGpsScreen } from "@/components/platform/gps/GolfGpsScreen";
import type { GpsCourse } from "@/lib/platform/golfGps/types";

/**
 * DEV ONLY: a real (OpenGolf + OpenStreetMap) course in the GPS screen, with Previous / Next hole. Steps through every
 * scorecard hole; a hole without playable green targets shows the screen's own "No map for Hole N yet" message.
 */
export function RealCourseGps({ course, holeNumbers, initialHole }: { course: GpsCourse; holeNumbers: number[]; initialHole: number }) {
  const [index, setIndex] = useState(Math.max(0, holeNumbers.indexOf(initialHole)));
  const number = holeNumbers[index];
  const playable = course.holes.some((hole) => hole.number === number);
  const step = (by: number) => setIndex((current) => (current + by + holeNumbers.length) % holeNumbers.length);
  const button = { background: "#3a0410", color: "#fbf8f1", border: 0, borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "center" } as const;
  return <main style={{ height: "100svh", display: "flex", flexDirection: "column", background: "#240001" }}>
    <nav aria-label="Hole" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", color: "#fbf8f1", font: "600 14px system-ui" }}>
      <button type="button" style={button} onClick={() => step(-1)} aria-label="Previous hole"><ChevronLeft size={18} aria-hidden />Prev</button>
      <span style={{ textAlign: "center" }}>Hole {number}{playable ? "" : " · no GPS targets"}<br /><small style={{ fontWeight: 400, opacity: 0.7 }}>{course.name}</small></span>
      <button type="button" style={button} onClick={() => step(1)} aria-label="Next hole">Next<ChevronRight size={18} aria-hidden /></button>
    </nav>
    <div style={{ flex: 1, minHeight: 0 }}>
      <GolfGpsScreen course={course} holeNumber={number} />
    </div>
  </main>;
}
