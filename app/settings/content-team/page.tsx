import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ContentTeam } from "@/components/settings/ContentTeam";
import { postCounts } from "@/lib/content/ribbon";
import { isRibbonSampleEnabled, sampleContentTeam, sampleRibbonItems } from "@/lib/content/ribbonSample";
import styles from "@/components/settings/Settings.module.css";

export const metadata: Metadata = { title: "Content team | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Settings → Content team (Admins only): Posters, their invites and post counts. DEV ONLY on sample data for now. */
export default function ContentTeamPage() {
  if (!isRibbonSampleEnabled()) notFound();
  const items = sampleRibbonItems();
  const members = sampleContentTeam().map((member) => ({ ...member, counts: postCounts(items, member.profileId) }));
  return <main className={styles.page}>
    <div className={styles.inner}>
      <header className={styles.header}>
        <Link href="/settings" className={styles.back} aria-label="Back to Settings"><ArrowLeft size={18} aria-hidden="true" /></Link>
        <span className={styles.backLabel}>Settings</span><h1 className="sr-only">Content team</h1>
      </header>
      <ContentTeam initial={members} sample />
    </div>
  </main>;
}
