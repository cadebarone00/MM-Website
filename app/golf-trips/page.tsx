import type { Metadata } from "next";
import styles from "@/components/platform/JoinTournament.module.css";
import pageStyles from "./page.module.css";

export const metadata: Metadata = { title: "Golf Trips | The Maroon" };

/** Golf Trips: maroon placeholder until the real page is built. */
export default function GolfTripsPage() {
  return (
    <main className={`${styles.page} ${pageStyles.page}`} aria-label="Golf Trips">
      <p className={pageStyles.soon}>Golf Trips coming soon</p>
    </main>
  );
}
