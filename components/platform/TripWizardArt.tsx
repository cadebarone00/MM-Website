"use client";

import { useEffect, useState } from "react";
import styles from "./CreateTournament.module.css";

/**
 * PLACEHOLDER for the Golf Trip wizard's cream animation (the real one is designed later with the owner): a golf ball
 * rolls along the fairway line toward the flag, moving from where the last step left it (`from`) to this step's place
 * (`to`, 0-1). Reduced motion: it just sits at `to`.
 */
export function TripWizardArt({ from, to }: { from: number; to: number }) {
  const [at, setAt] = useState(from);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAt(to));
    return () => cancelAnimationFrame(frame);
  }, [to]);
  return <div className={styles.artTrack}>
    <span className={styles.artLine} />
    <span className={styles.artFlag}><svg viewBox="0 0 24 40" aria-hidden="true"><path d="M3 2v36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /><path d="M4 3h16l-5 6 5 6H4z" fill="currentColor" /></svg></span>
    <span className={styles.artBall} style={{ left: `calc(${at * 100}% - ${at * 22}px)` }} />
  </div>;
}
