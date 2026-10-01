import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformHeader } from "@/components/platform/PlatformHeader";
import { setupTypeFromParam } from "@/lib/platform/setupTypes";
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

  return <>
    <PlatformHeader title="Create Tournament" />
    <main className={styles.page}>
      <section className={styles.intro}>
        <h2 className={styles.title}>{type.name} setup</h2>
        {isGolfTrip
          ? <Link href="/golf-trips/new" className={`${styles.continue} ${styles.start}`}>Let&apos;s go golfing</Link>
          : <p className={styles.subtitle}>The next step is coming soon</p>}
        <Link href={isGolfTrip ? "/golf-trips" : "/tournaments/create"} className={styles.back}>Back</Link>
      </section>
    </main>
  </>;
}
