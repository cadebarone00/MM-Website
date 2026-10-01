import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformHeader } from "@/components/platform/PlatformHeader";
import { setupTypeFromParam } from "@/lib/platform/setupTypes";
import styles from "@/components/platform/CreateTournament.module.css";

export const metadata: Metadata = { title: "Create a Tournament | The Maroon" };

/** Placeholder for setup page 2. Each type (event, team, league, group) gets its own branch here later. */
export default async function SetupNextStepPage({ params }: { params: Promise<{ type: string }> }) {
  const { type: param } = await params;
  const type = setupTypeFromParam(param);
  if (!type) notFound();

  return <>
    <PlatformHeader title="Create Tournament" />
    <main className={styles.page}>
      <section className={styles.intro}>
        <h2 className={styles.title}>{type.name} setup</h2>
        <p className={styles.subtitle}>The next step is coming soon</p>
        <Link href="/tournaments/create" className={styles.back}>Back</Link>
      </section>
    </main>
  </>;
}
