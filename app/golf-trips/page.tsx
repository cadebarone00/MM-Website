import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Golf Trips | The Maroon" };

/**
 * Golf Trip Home: start a new trip, then My Trips (upcoming + past).
 * No trip data exists yet, so both lists show their empty state.
 */
export default function GolfTripsPage() {
  return (
    <main className={styles.page}>
      <Link href="/tournaments/create/golf-trip" className={styles.create}>
        <span className={styles.plus} aria-hidden="true"><Plus size={20} strokeWidth={2.25} /></span>
        Create a Golf Trip
      </Link>

      <section aria-labelledby="my-trips-heading" className={styles.trips}>
        <h2 id="my-trips-heading" className={styles.heading}>My Trips</h2>
        <div className={styles.card}>
          <div className={styles.group}>
            <h3 className={styles.label}>Upcoming Trip</h3>
            <p className={styles.note}>No upcoming trip yet.</p>
          </div>
          <div className={styles.group}>
            <h3 className={styles.label}>Past Trips</h3>
            <p className={styles.note}>No past trips yet.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
