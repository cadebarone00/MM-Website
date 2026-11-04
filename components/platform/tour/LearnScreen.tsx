"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QUICK_SWIPES, TOUR_SEEN_KEY, markSeen } from "@/lib/platform/tripTour";
import { TourPhone } from "./TourPhone";
import styles from "./Tour.module.css";

/**
 * Trip Builder's Learn screen (first time only): a phone inside the screen with 3 quick swipe pages. Its bottom fades
 * into a strong "Learn about Golf Trips" (the full tour) and a small "Skip for now" (straight to the first question).
 */
export function LearnScreen({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const touch = useRef<number | null>(null);
  const skip = () => { markSeen(TOUR_SEEN_KEY, profileId); router.push("/golf-trips/new"); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setPage(p => Math.min(QUICK_SWIPES.length - 1, p + 1));
      if (event.key === "ArrowLeft") setPage(p => Math.max(0, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const swipe = QUICK_SWIPES[page];
  return <main className={styles.page}>
    <div className={styles.phoneArea}
      onTouchStart={event => { touch.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={event => {
        const start = touch.current, end = event.changedTouches[0]?.clientX;
        touch.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 40) return;
        setPage(p => end < start ? Math.min(QUICK_SWIPES.length - 1, p + 1) : Math.max(0, p - 1));
      }}>
      <TourPhone page={swipe} fade />
    </div>
    <div className={styles.copy} aria-live="polite">
      <h1 className={styles.title}>{swipe.title}</h1>
      <p className={styles.body}>{swipe.body}</p>
      <div className={styles.dots} role="tablist" aria-label="Quick look">
        {QUICK_SWIPES.map((item, index) => <button key={item.title} type="button" role="tab" aria-selected={index === page} aria-label={item.title}
          className={`${styles.dot} ${index === page ? styles.dotOn : ""}`} onClick={() => setPage(index)} />)}
      </div>
    </div>
    <div className={styles.actions}>
      <Link href="/golf-trips/new/tour" className={styles.primary}>Learn about Golf Trips</Link>
      <button type="button" className={styles.skip} onClick={skip}>Skip for now</button>
    </div>
  </main>;
}
