import type { Metadata } from "next";
import Link from "next/link";
import { SetupSheet } from "@/components/platform/SetupSheet";
import styles from "@/components/platform/CreateTournament.module.css";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/** Golf Trip questionnaire, step 4 (Travel & Stay). Placeholder until the questions are built. */
export default function GolfTripTravelPage() {
  return <SetupSheet label="Travel & Stay" top={<>
    <p className={styles.creamNote}>Step 4 of 5</p>
    <h2 className={styles.creamTitle}>Travel &amp; Stay</h2>
  </>}>
    <p className={styles.sheetNote}>Travel questions are coming next</p>
    <Link href="/golf-trips/new/golf" className={styles.back}>Back</Link>
  </SetupSheet>;
}
