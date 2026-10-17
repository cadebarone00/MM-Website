import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DevDeleteAccountPreview } from "@/components/dev/DevDeleteAccountPreview";
import styles from "@/components/settings/Settings.module.css";

export const metadata: Metadata = { title: "Delete account preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: Settings → Delete account on sample data. ?outcome=completed | closed | wrong-password picks the simulated answer. */
export default async function DevDeleteAccountPage({ searchParams }: { searchParams: Promise<{ outcome?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { outcome } = await searchParams;
  const pick = outcome === "closed" || outcome === "wrong-password" ? outcome : "completed";
  return <main className={styles.page}>
    <div className={styles.inner}>
      <header className={styles.header}>
        <Link href="/dev/profile/settings" className={styles.back} aria-label="Back to Settings"><ArrowLeft size={18} aria-hidden="true" /></Link>
        <span className={styles.backLabel}>Settings</span><h1 className="sr-only">Delete account</h1>
      </header>
      <DevDeleteAccountPreview outcome={pick} />
    </div>
  </main>;
}
