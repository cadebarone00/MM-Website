import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetupSheet } from "@/components/platform/SetupSheet";
import { GetStartedButton } from "@/components/platform/tour/GetStartedButton";
import { setupTypeFromParam } from "@/lib/platform/setupTypes";
import { getCurrentProfile, tripProfileId } from "@/lib/profile/currentProfile";
import styles from "@/components/platform/CreateTournament.module.css";

export const metadata: Metadata = { title: "Create a Tournament | The Maroon" };

/**
 * Setup page 2. Golf Trip starts its questionnaire from here ("Let's go golfing" → /golf-trips/new);
 * the other types (event, team, league, group) are placeholders that get their own branch later.
 */
export default async function SetupNextStepPage({ params }: { params: Promise<{ type: string }> }) {
  const { type: param } = await params;
  const type = setupTypeFromParam(param);
  if (!type) notFound();
  const isGolfTrip = type.key === "golf-trip";

  // Trip Builder (2026-11-03): Welcome to Golf Trips → Get Started (the Learn screen the first time).
  const profileId = isGolfTrip ? tripProfileId(await getCurrentProfile()) ?? "guest" : "guest";
  return <SetupSheet label={isGolfTrip ? "Welcome to Golf Trips" : `${type.name} setup`} wizardStep={isGolfTrip ? 0 : undefined} top={<h2 className={styles.creamTitle}>{type.name} setup</h2>}>
    {isGolfTrip
      ? <GetStartedButton profileId={profileId} className={`${styles.continue} ${styles.start}`} />
      : <p className={styles.sheetNote}>The next step is coming soon</p>}
    <Link href={isGolfTrip ? "/golf-trips" : "/tournaments/join"} className={styles.back}>Back</Link>
  </SetupSheet>;
}
