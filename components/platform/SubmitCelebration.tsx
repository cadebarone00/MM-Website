"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import styles from "./SubmitCelebration.module.css";

/** How long the moment lasts before it calls onDone (the CSS slide-out ends at the same time). */
export const CELEBRATION_MS = 2600;

/**
 * Submit & Save's full-screen moment (Player & Attest add-on, decision 16): a maroon screen rises over everything with the
 * final score big, a check and "Card submitted", then slides away to the locked Card underneath.
 */
export function SubmitCelebration({ total, toPar, onDone }: { total: number; toPar: string; onDone: () => void }) {
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => { const timer = window.setTimeout(() => done.current(), CELEBRATION_MS); return () => window.clearTimeout(timer); }, []);
  return createPortal(<div className={styles.screen} role="status" aria-live="assertive">
    <span className={styles.check} aria-hidden><Check size={44} strokeWidth={3} /></span>
    <p className={styles.score}>{total}{toPar && <><span className={styles.dot} aria-hidden> · </span><span className={styles.toPar}>{toPar}</span></>}</p>
    <p className={styles.label}>Card submitted</p>
  </div>, document.body);
}
