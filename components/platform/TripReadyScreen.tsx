"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { MaroonMark } from "@/components/brand/MaroonMark";
import styles from "./TripReadyScreen.module.css";

const DRAW_MS = 1000;
// Same firework as the "Email confirmed" screen (components/dev/auth/AuthLinkResultPreview.tsx): fixed seed, ~20 dashes.
const PILLS = (() => {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 20 }, (_, index) => {
    const angle = (index / 20) * 2 * Math.PI + (random() - 0.5) * 0.35;
    const reach = index % 2 ? 0.5 + random() * 0.25 : 0.95 + random() * 0.3;
    return { x: Math.round(Math.cos(angle) * 190 * reach), y: Math.round(Math.sin(angle) * 140 * reach),
      tilt: Math.round((angle * 180) / Math.PI + 90 + (random() - 0.5) * 50), length: Math.round(3 + random() * 13), delay: Math.round(random() * 140) };
  });
})();

/**
 * Trip Builder's finish: "Your trip is ready", in the same look as "Email confirmed" — the gold M writes itself, a
 * little gold burst, then one button, Invite your crew (opens the invite pop-up). Reduced motion: no animation.
 */
export function TripReadyScreen({ onInvite }: { onInvite: () => void }) {
  return <main className={styles.page}>
    <div className={styles.heading}>
      <ReadyMark />
      <h1 className={styles.title}>Your trip is ready</h1>
    </div>
    <button type="button" className={styles.button} onClick={onInvite} autoFocus>Invite your crew</button>
  </main>;
}

function ReadyMark() {
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion is only known in the browser, after the server render
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
    <div className={styles.reveal} style={{ clipPath: `inset(-10% ${(1 - progress) * 100}% -10% -10%)` }}><MaroonMark color="#c9a86e" /></div>
    {progress >= 1 && reducedMotion === false && <div className={styles.burst}>
      {PILLS.map((pill, index) => <span key={index} style={{ "--x": `${pill.x}px`, "--y": `${pill.y}px`, "--tilt": `${pill.tilt}deg`, height: pill.length, marginTop: -pill.length / 2, animationDelay: `${pill.delay}ms` } as CSSProperties} />)}
    </div>}
  </div>;
}
