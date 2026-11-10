"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { QUICK_SWIPES, TOUR_SEEN_KEY, markSeen } from "@/lib/platform/tripTour";
import { TourPhone } from "./TourPhone";
import styles from "./Tour.module.css";

/**
 * Trip Builder's Learn screen (first time only): one page with a phone inside the screen. Its bottom fades into a
 * strong "Learn about Golf Trips" (the full tour) and a small "Skip for now" (straight to the first question).
 */
export function LearnScreen({ profileId }: { profileId: string }) {
  const router = useRouter();
  const skip = () => { markSeen(TOUR_SEEN_KEY, profileId); router.push("/golf-trips/new"); };
  const intro = QUICK_SWIPES[0];

  return <main className={styles.page}>
    <div className={styles.phoneArea}>
      <TourPhone page={intro} fade />
    </div>
    <div className={styles.copy}>
      <h1 className={styles.title}>{intro.title}</h1>
      <p className={styles.body}>{intro.body}</p>
    </div>
    <div className={`${styles.actions} ${styles.learnActions}`}>
      <Link href="/golf-trips/new/tour" className={styles.primary}>Learn about Golf Trips</Link>
      <button type="button" className={styles.skip} onClick={skip}>Skip for now</button>
    </div>
  </main>;
}
