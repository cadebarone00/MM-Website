"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CoachStop } from "@/lib/platform/coachMarks";
import styles from "./CoachMarks.module.css";

type Box = { top: number; left: number; width: number; height: number };

/**
 * First-visit tips on the trip home: the screen dims, the button for each stop (data-coach="<target>") gets a gold
 * ring, and a bubble explains it with Next / Got it. Stops whose button isn't on screen are skipped. Escape or tapping
 * the dim ends the whole set (that counts as seen). No browser dialogs.
 */
export function CoachMarks({ stops, onDone }: { stops: CoachStop[]; onDone: () => void }) {
  const [shown, setShown] = useState<CoachStop[] | null>(null);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  // Only the stops whose target is on this screen right now.
  useEffect(() => {
    const present = stops.filter(stop => document.querySelector(`[data-coach="${stop.target}"]`));
    if (!present.length) { onDone(); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- which buttons are on screen is only known after the page has drawn
    setShown(present);
  }, [stops, onDone]);

  const stop = shown?.[index];
  useLayoutEffect(() => {
    if (!stop) return;
    const measure = () => {
      const element = document.querySelector<HTMLElement>(`[data-coach="${stop.target}"]`);
      const r = element?.getBoundingClientRect();
      setBox(r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [stop]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  if (!shown || !stop || !box) return null;
  const last = index === shown.length - 1;
  const pad = 6;
  const below = box.top + box.height + 12 + 120 < window.innerHeight;
  const bubbleTop = below ? box.top + box.height + 12 : Math.max(12, box.top - 12 - 120);
  const bubbleLeft = Math.min(Math.max(12, box.left + box.width / 2 - 130), window.innerWidth - 272);

  return createPortal(<div className={styles.layer} onClick={onDone}>
    <span className={styles.ring} style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />
    <div role="dialog" aria-modal="true" aria-label="Tip" className={styles.bubble} style={{ top: bubbleTop, left: bubbleLeft }} onClick={event => event.stopPropagation()}>
      <p className={styles.text}>{stop.text}</p>
      <div className={styles.row}>
        <span className={styles.count}>{index + 1} of {shown.length}</span>
        <button type="button" className={styles.button} autoFocus onClick={() => last ? onDone() : setIndex(index + 1)}>{last ? "Got it" : "Next"}</button>
      </div>
    </div>
  </div>, document.body);
}
