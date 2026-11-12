"use client";

import Link from "next/link";
import { MessageCircle, Settings } from "lucide-react";
import { GolfTripTitle } from "./GolfTripTitle";
import { TripFeedTab } from "./TripFeedTab";
import styles from "./GolfTripHome.module.css";

export function GolfTripHeader({ name, settingsHref, scope, spectator, onChat }: {
  name: string; settingsHref: string; scope: string; spectator: boolean; onChat: () => void;
}) {
  return <div className={styles.tripTitleRow}>
    {!spectator && <div className={styles.tripTitleActions}>
      <Link href={settingsHref} className={styles.iconButton} aria-label="Trip settings" data-coach="settings"><Settings size={24} strokeWidth={1.75} aria-hidden /></Link>
      <button type="button" className={styles.iconButton} aria-label="Trip chat" onClick={onChat}><MessageCircle size={24} strokeWidth={1.75} aria-hidden /></button>
    </div>}
    <GolfTripTitle name={name} />
    {!spectator && <div className={styles.tripTitleFeed}><TripFeedTab scope={scope} triggerClassName={styles.iconButton} /></div>}
  </div>;
}
