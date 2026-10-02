"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, Empty } from "./GolfTripHome";
import styles from "./GolfTripHome.module.css";

const TABS = ["General", "Organizer"] as const;
type Tab = (typeof TABS)[number];

/**
 * Trip Settings, opened from the settings wheel on Golf Trip Home. Layout only: the sections are empty for now.
 * The trip's organizer gets a General / Organizer selector; everyone else just sees General.
 */
export function GolfTripSettings({ backHref, isOrganizer }: { backHref: string; isOrganizer: boolean }) {
  const [tab, setTab] = useState<Tab>("General");
  const shown: Tab = isOrganizer ? tab : "General";

  return <main className={styles.page}>
    <header className={styles.settingsHeader}>
      <Link href={backHref} className={`${styles.iconButton} ${styles.backButton}`} aria-label="Back to trip"><ChevronLeft size={26} strokeWidth={1.75} aria-hidden /></Link>
      <h1 className={styles.settingsTitle}>Trip Settings</h1>
      {isOrganizer && <div className={styles.tabs} role="tablist" aria-label="Settings sections">
        {TABS.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name}
          className={`${styles.tab} ${tab === name ? styles.tabActive : ""}`} onClick={() => setTab(name)}>{name}</button>)}
      </div>}
    </header>
    <div className={styles.body} role={isOrganizer ? "tabpanel" : undefined} aria-label={`${shown} settings`}>
      <Card title={`${shown} settings`}><Empty>Coming soon</Empty></Card>
    </div>
  </main>;
}
