"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MaroonMark } from "./MaroonMark";
import styles from "./BrandPreview.module.css";

const subscribe = (callback: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const reducedSnapshot = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function BrandPreview() {
  const reducedMotion = useSyncExternalStore(subscribe, reducedSnapshot, () => true);
  const [progress, setProgress] = useState(1);
  const [duration, setDuration] = useState(1200);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(0);
  const frame = useRef(0);

  useEffect(() => {
    if (!running || reducedMotion) return;
    let start: number | undefined;
    const tick = (now: number) => {
      start ??= now;
      const next = Math.min(1, (now - start) / duration);
      setProgress(next);
      if (next < 1) frame.current = requestAnimationFrame(tick);
      else setRunning(false);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [running, run, duration, reducedMotion]);

  function replay() {
    if (reducedMotion) return;
    setProgress(0);
    setRunning(true);
    setRun(value => value + 1);
  }

  const shown = reducedMotion ? 1 : progress;
  return <main className={styles.page}>
    <header className={styles.header}><span>THE MAROON / BRAND STUDIO</span><h1>A signature in motion.</h1><p>One M. Three expressions.</p></header>
    <div className={styles.workspace}>
      <section className={styles.phoneColumn} aria-label="Phone entrance">
        <div className={styles.phone}><MaroonMark variant="intro" color="white" progress={shown} /></div>
        <p className={styles.caption}>Phone entrance · 393 × 852</p>
      </section>
      <section className={styles.controls} aria-label="Animation controls">
        <span className={styles.eyebrow}>HANDWRITING</span><h2>Left to right.<br />In one gesture.</h2>
        <p>Entry sweep → first peak → center loop → rounded peak → exit sweep.</p>
        <button type="button" onClick={replay} disabled={reducedMotion}>{running ? "Replay from start" : "Replay entrance"}</button>
        <label htmlFor="duration">Drawing time <strong>{(duration / 1000).toFixed(1)} s</strong></label>
        <input id="duration" type="range" min="600" max="2400" step="100" value={duration} disabled={reducedMotion} onChange={event => { setRunning(false); setDuration(Number(event.target.value)); }} />
        <label htmlFor="progress">Inspect the stroke <strong>{Math.round(shown * 100)}%</strong></label>
        <input id="progress" type="range" min="0" max="1000" value={Math.round(shown * 1000)} disabled={reducedMotion} onChange={event => { setRunning(false); setProgress(Number(event.target.value) / 1000); }} />
        {reducedMotion && <p role="status">Reduced motion is on. The finished logo is shown.</p>}
        <div className={styles.assets}>
          <div><div className={styles.icon}><MaroonMark variant="icon" color="white" /></div><span>App icon</span></div>
          <div><div className={styles.standalone}><MaroonMark color="#500F23" /></div><span>Standalone M</span></div>
        </div>
        <a href="/brand/maroon-m-maroon.svg" download>Download standalone SVG</a>
      </section>
    </div>
  </main>;
}
