"use client";
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { MaroonMark } from "@/components/brand/MaroonMark";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import styles from "./AuthLinkResultPreview.module.css";

const DRAW_MS = 1000;
// Firework: ~20 gold dashes thrown out of the M, half landing close and half far, uneven angles and lengths, wider
// than tall; they fade away as the burst ends. A fixed seed keeps the pattern the same on every replay.
const PILLS = (() => {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 20 }, (_, index) => {
    const angle = (index / 20) * 2 * Math.PI + (random() - 0.5) * 0.35;
    const reach = index % 2 ? 0.5 + random() * 0.25 : 0.95 + random() * 0.3; // close ring / far ring
    return {
      x: Math.round(Math.cos(angle) * 190 * reach),
      y: Math.round(Math.sin(angle) * 140 * reach),
      tilt: Math.round((angle * 180) / Math.PI + 90 + (random() - 0.5) * 50),
      length: Math.round(3 + random() * 13),
      delay: Math.round(random() * 140),
    };
  });
})();

/** DEV ONLY: Authentication "Link confirmed": shown after someone taps the link in the email instead of typing the code.
 * The gold M (the same mark as the top of the other screens) writes itself left to right in 1 second, then little
 * pills burst out of it like a firework and fade (all skipped for reduced motion).
 * The simulator's "Replay animation" bumps brandReplay, which remounts the mark and plays it again. */
export function AuthLinkResultPreview({ nextHref = "/dev/auth/password" }: { nextHref?: string } = {}) {
  const replay = useSimulator()?.state?.brandReplay ?? 0;
  // Only the title + button are centred; the M hangs just above the title so it never pushes them off centre.
  return <main className={styles.page}>
    <div className={styles.heading}>
      <ConfirmedMark key={replay} />
      <h1 className={styles.title}>Email confirmed</h1>
    </div>
    <Link href={nextHref} className={styles.button}>Continue</Link>
  </main>;
}

function ConfirmedMark() {
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(reduced);
    if (reduced) { setProgress(1); return; }
    let frame = 0;
    let start: number | undefined;
    function tick(now: number) {
      start ??= now;
      const next = Math.min(1, (now - start) / DRAW_MS);
      setProgress(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <div className={styles.mark} aria-hidden="true">
    {/* The standalone mark has no stroke-by-stroke drawing, so it is revealed left to right like a pen stroke. */}
    <div className={styles.reveal} style={{ clipPath: `inset(-10% ${(1 - progress) * 100}% -10% -10%)` }}>
      <MaroonMark color="#c9a86e" />
    </div>
    {progress >= 1 && reducedMotion === false && <div className={styles.burst}>
      {PILLS.map((pill, index) => <span key={index} style={{ "--x": `${pill.x}px`, "--y": `${pill.y}px`, "--tilt": `${pill.tilt}deg`, height: pill.length, marginTop: -pill.length / 2, animationDelay: `${pill.delay}ms` } as CSSProperties} />)}
    </div>}
  </div>;
}
