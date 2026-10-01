import type { Metadata } from "next";
import Link from "next/link";
import { SetupSheet } from "@/components/platform/SetupSheet";
import styles from "@/components/platform/CreateTournament.module.css";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/** Golf Trip questionnaire, last step (Review & Create). Placeholder until it is built. */
export default function GolfTripReviewPage() {
  return <SetupSheet label="Review">
    <p className={styles.sheetNote}>Review &amp; Create is coming next</p>
    <Link href="/golf-trips/new/transportation" className={styles.back}>Back</Link>
  </SetupSheet>;
}
