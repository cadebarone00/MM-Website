"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Card } from "./GolfTripHome";
import { GolfTripMembers, LeaveGolfTrip } from "./GolfTripMembers";
import { GolfTripCorrections } from "./GolfTripCorrections";
import type { SavedGolfTrip } from "@/lib/platform/golfTripCreate";
import styles from "./GolfTripHome.module.css";
import settingsStyles from "./GolfTripSettingsPreview.module.css";

type Tab = "General" | "Organizer" | "Corrections";

/**
 * Trip Settings, opened from the settings wheel on Golf Trip Home. The trip's organizer gets a General / Organizer
 * selector; everyone else just sees General. `tripId` is the saved trip Delete Trip removes, or null in the
 * /dev/tournament preview, where Delete Trip only says what would happen. A saved trip also passes its members (as the
 * server lets this viewer see them): everyone gets the member list, members get Leave Trip, the organizer manages invites.
 * A saved trip also gets Corrections (Step 6: scorecard corrections on any day; Approve / Deny where the database allows).
 */
export function GolfTripSettings({ backHref, isOrganizer, tripId, members, viewerMemberId, profileId }: {
  backHref: string; isOrganizer: boolean; tripId: string | null; members?: SavedGolfTrip["members"]; viewerMemberId?: string; profileId?: string;
}) {
  const saved = tripId !== null && members && viewerMemberId ? { tripId, members, viewerMemberId } : null;
  const tabs: Tab[] = [...(["General"] as const), ...(isOrganizer ? ["Organizer" as const] : []), ...(saved && profileId ? ["Corrections" as const] : [])];
  const [tab, setTab] = useState<Tab>("General");
  const shown: Tab = tabs.includes(tab) ? tab : "General";

  return <main className={styles.page}>
    <header className={styles.settingsHeader}>
      <Link href={backHref} className={`${styles.iconButton} ${styles.backButton}`} aria-label="Back to trip"><ChevronLeft size={26} strokeWidth={1.75} aria-hidden /></Link>
      <h1 className={styles.settingsTitle}>Trip Settings</h1>
      {tabs.length > 1 && <div className={styles.tabs} role="tablist" aria-label="Settings sections">
        {tabs.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name}
          className={`${styles.tab} ${tab === name ? styles.tabActive : ""}`} onClick={() => setTab(name)}>{name}</button>)}
      </div>}
    </header>
    <div className={styles.body} role={tabs.length > 1 ? "tabpanel" : undefined} aria-label={`${shown} settings`}>
      {shown === "Corrections" && saved && profileId ? <GolfTripCorrections tripId={saved.tripId} profileId={profileId} />
        : shown === "Organizer"
        ? <>
          {saved && <GolfTripMembers {...saved} manage />}
          <DeleteTrip tripId={tripId} />
        </>
        : <>
        {saved && <GolfTripMembers {...saved} manage={false} />}
        {saved && !isOrganizer && <LeaveGolfTrip tripId={saved.tripId} />}
        <div className={settingsStyles.grid}>
          {["My Team", "General", "Draft", "Playoffs", "Roster", "Scoring"].map(title =>
            <section key={title} className={settingsStyles.card} aria-label={title}>
              <h2>{title}</h2>
            </section>)}
        </div>
        </>}
    </div>
  </main>;
}

/** Delete Trip: one tap opens a simple "are you sure", and Delete removes the whole trip, then goes to Golf Trips. */
function DeleteTrip({ tripId }: { tripId: string | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function deleteTrip() {
    if (tripId === null) {
      setMessage("Preview only: nothing was deleted.");
      setConfirming(false);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/golf-trips/${tripId}`, { method: "DELETE" });
      const result = await response.json().catch(() => null) as { ok?: boolean; url?: string; error?: string } | null;
      if (response.ok && result?.ok) {
        router.replace(result.url ?? "/golf-trips");
        router.refresh();
        return;
      }
      setMessage(result?.error ?? "We couldn't delete this trip. Try again.");
    } catch {
      setMessage("We couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
    setConfirming(false);
  }

  return <Card title="Delete trip">
    <p className={styles.settingsNote}>Deletes this trip, its rounds and everyone&apos;s spot on it. Players keep their own accounts.</p>
    {confirming
      ? <div className={styles.confirm} role="alertdialog" aria-label="Delete this trip?">
        <p className={styles.text}>Delete this trip? This can&apos;t be undone.</p>
        <div className={styles.confirmActions}>
          <button type="button" className={styles.cancelButton} onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
          <button type="button" className={styles.deleteButton} onClick={deleteTrip} disabled={busy}>{busy ? "Deleting…" : "Delete"}</button>
        </div>
      </div>
      : <button type="button" className={styles.dangerButton} onClick={() => { setConfirming(true); setMessage(""); }}>Delete Trip</button>}
    {message && <p className={styles.settingsMessage} role="status">{message}</p>}
  </Card>;
}
