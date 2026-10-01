import type { Metadata } from "next";
import Link from "next/link";
import { SetupSheet } from "@/components/platform/SetupSheet";
import styles from "@/components/platform/CreateTournament.module.css";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/** Golf Trip questionnaire, step 3 (Golf). Placeholder until the questions are built. */
export default function GolfTripGolfPage() {
  return <SetupSheet label="Golf" top={<>
    <p className={styles.creamNote}>Step 3 of 5</p>
    <h2 className={styles.creamTitle}>Golf</h2>
  </>}>
    <p className={styles.sheetNote}>Golf questions are coming next</p>
    <Link href="/golf-trips/new/players" className={styles.back}>Back</Link>
  </SetupSheet>;
}
