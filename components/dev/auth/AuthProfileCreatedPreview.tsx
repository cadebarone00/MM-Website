"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MaroonMark } from "@/components/brand/MaroonMark";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { lightTap, mediumImpact } from "@/lib/haptics";
import styles from "./AuthProfileCreatedPreview.module.css";

const DRAW_MS = 2400;
const PULSE_MS = 200;

/** DEV ONLY: Authentication "Profile created". The full edge-to-edge handwriting M (the app entrance mark) draws itself
 * slowly while the phone buzzes, building from strength 1 to 6; then "Profile Created!" fades in. Reduced motion: the
 * finished screen, no buzzing. The simulator's "Replay animation" bumps brandReplay to play it again. */
export function AuthProfileCreatedPreview() {
  const replay = useSimulator()?.state?.brandReplay ?? 0;
  return <ProfileCreated key={replay} />;
}

function ProfileCreated() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setProgress(1); return; }
    let frame = 0;
    let start: number | undefined;
    let pulses = 0;
    function tick(now: number) {
      start ??= now;
      const elapsed = now - start;
      // One buzz every 200ms while drawing; strength climbs 1 → 6 across the drawing.
      if (elapsed < DRAW_MS && elapsed >= pulses * PULSE_MS) {
        const level = 1 + Math.min(5, Math.floor((elapsed / DRAW_MS) * 6));
        void (level <= 3 ? lightTap : mediumImpact)({ intensity: level, durationMs: 150 });
        pulses++;
      }
      const next = Math.min(1, elapsed / DRAW_MS);
      setProgress(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  const done = progress >= 1;

  // Only the words + button are centred; the M hangs above them so it never pushes them off centre.
  return <main className={styles.page}>
    <div className={styles.heading}>
      <div className={styles.mark} aria-hidden="true">
        {/* The intro variant is the full M, tail touching the left edge and swoop the right, centred in a tall "slice" viewBox. */}
        <MaroonMark variant="intro" color="#c9a86e" progress={progress} />
      </div>
      <div className={`${styles.words} ${done ? styles.shown : ""}`}>
        <h1 className={styles.title}>Profile Created!</h1>
        <p className={styles.subtitle}>Time to play some golf</p>
      </div>
    </div>
    <Link href="/" className={`${styles.button} ${done ? styles.shown : ""}`} tabIndex={done ? undefined : -1}>Let&apos;s go</Link>
  </main>;
}
