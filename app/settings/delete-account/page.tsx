import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DeleteAccountFlow, type DeletionPreviewData } from "@/components/settings/DeleteAccountFlow";
import { deletionPreview } from "@/lib/account/accountDeletion";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import styles from "@/components/settings/Settings.module.css";

export const metadata: Metadata = { title: "Delete account | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Settings → Account → Delete account. Anyone signed in can start it themselves (finished profile or not). */
export default async function DeleteAccountPage() {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") redirect("/login");
  const preview = await deletionPreview(current.account.id) as DeletionPreviewData | null;
  return <main className={styles.page}>
    <div className={styles.inner}>
      <header className={styles.header}>
        <Link href="/settings" className={styles.back} aria-label="Back to Settings"><ArrowLeft size={18} aria-hidden="true" /></Link>
        <span className={styles.backLabel}>Settings</span><h1 className="sr-only">Delete account</h1>
      </header>
      {preview ? <DeleteAccountFlow initial={preview} />
        : <section className={styles.card}><p className={styles.text}>Account deletion isn&apos;t switched on yet.</p></section>}
    </div>
  </main>;
}
