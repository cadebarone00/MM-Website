import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { DeleteAccountFlow, type DeletionPreviewData } from "./DeleteAccountFlow";
import { ContentTeam } from "./ContentTeam";
import styles from "./Settings.module.css";

/** A Settings page with the "← Settings" header. */
function SettingsSubpage({ title, children }: { title: string; children: ReactNode }) {
  return <main className={styles.page}>
    <div className={styles.inner}>
      <header className={styles.header}>
        <Link href="/settings" className={styles.back} aria-label="Back to Settings"><ArrowLeft size={18} aria-hidden="true" /></Link>
        <span className={styles.backLabel}>Settings</span><h1 className="sr-only">{title}</h1>
      </header>
      {children}
    </div>
  </main>;
}

/** Settings → Delete account. Shared by the website's page and the iPhone / Android app's. */
export function DeleteAccountView({ preview }: { preview: DeletionPreviewData | null }) {
  return <SettingsSubpage title="Delete account">
    {preview ? <DeleteAccountFlow initial={preview} />
      : <section className={styles.card}><p className={styles.text}>Account deletion isn&apos;t switched on yet.</p></section>}
  </SettingsSubpage>;
}

/** Settings → Content team (Content Admins). Shared by the website's page and the app's. */
export function ContentTeamView({ members, sample }: { members: Parameters<typeof ContentTeam>[0]["initial"]; sample: boolean }) {
  return <SettingsSubpage title="Content team"><ContentTeam initial={members} sample={sample} /></SettingsSubpage>;
}
