import { notFound } from "next/navigation";
import Link from "next/link";
import { DeleteTrip } from "@/components/platform/GolfTripSettings";
import styles from "@/components/platform/GolfTripHome.module.css";

export default function DeleteTripScreen() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main className={styles.page}>
    <Link href="/dev/tournament/settings" className={styles.backButton}>Back to settings</Link>
    <h1>Delete Trip</h1>
    <DeleteTrip tripId={null} />
  </main>;
}
