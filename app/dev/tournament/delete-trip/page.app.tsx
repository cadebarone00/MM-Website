import Link from "next/link";
import { DeleteTrip } from "@/components/platform/GolfTripSettings";
import styles from "@/components/platform/GolfTripHome.module.css";

/** App → the example trip's Delete Trip screen (dev server only). */
export default function DevDeleteTripAppPage() {
  if (process.env.NODE_ENV !== "development") return null;
  return <main className={styles.page}>
    <Link href="/dev/tournament/settings" className={styles.backButton}>Back to settings</Link>
    <h1>Delete Trip</h1>
    <DeleteTrip tripId={null} />
  </main>;
}
