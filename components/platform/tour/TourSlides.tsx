"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TOUR_SEEN_KEY, TOUR_SLIDES, markSeen } from "@/lib/platform/tripTour";
import { TourPhone } from "./TourPhone";
import styles from "./Tour.module.css";

/**
 * The full Golf Trips tour: 6 slides, each a real trip screen (sample data) with a gold outline and note. The last
 * slide (or Skip) marks it seen and goes on: to the first Trip Builder question, or back to `doneHref` on a replay.
 */
export function TourSlides({ profileId, doneHref = "/golf-trips/new" }: { profileId: string; doneHref?: string }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const slide = TOUR_SLIDES[index];
  const last = index === TOUR_SLIDES.length - 1;
  const finish = () => { markSeen(TOUR_SEEN_KEY, profileId); router.push(doneHref); };
  return <main className={styles.page}>
    <div className={styles.phoneArea}><TourPhone page={slide} fade /></div>
    <div className={styles.copy} aria-live="polite">
      <h1 className={styles.title}>{slide.title}</h1>
      <p className={styles.body}>{slide.body}</p>
      <div className={styles.dots} aria-hidden="true">
        {TOUR_SLIDES.map((item, i) => <span key={item.title} className={`${styles.dot} ${i === index ? styles.dotOn : ""}`} />)}
      </div>
    </div>
    <div className={styles.actions}>
      <button type="button" className={styles.primary} onClick={() => last ? finish() : setIndex(index + 1)}>{last ? "Let’s build your trip" : "Next"}</button>
      {/* Same height on every slide (fixed layout): the last slide's Skip is just hidden. */}
      <button type="button" className={styles.skip} onClick={finish} style={{ visibility: last ? "hidden" : "visible" }}>Skip</button>
    </div>
  </main>;
}
