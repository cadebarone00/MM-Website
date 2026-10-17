"use client";

import { useState } from "react";
import settings from "./Settings.module.css";
import styles from "./DeleteAccount.module.css";

export type OrganizerOfferItem = { tripId: string; tripName: string; fromName: string; accepted: boolean; declined: boolean };

/**
 * Settings: "Organizer requests". When an organizer is leaving (deleting their account) they can ask you to take over a
 * trip. Nothing changes unless you accept; accepting means you become organizer if they go ahead and delete.
 */
export function OrganizerOffers({ initial }: { initial: OrganizerOfferItem[] }) {
  const [offers, setOffers] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(tripId: string, accept: boolean) {
    setBusy(tripId);
    setError(null);
    const response = await fetch(`/api/golf-trips/${tripId}/organizer-handoff`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accept }) }).catch(() => null);
    const body = await response?.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (response?.ok && body?.ok) setOffers((list) => list.map((o) => o.tripId === tripId ? { ...o, accepted: accept, declined: !accept } : o));
    else setError(body?.error ?? "That didn't save. Try again.");
    setBusy(null);
  }

  return <>
    <h2 id="settings-offers" className={settings.cardTitle}>Organizer requests</h2>
    {offers.map((offer) => <div key={offer.tripId} className={styles.offer}>
      <p className={settings.text}><strong>{offer.fromName}</strong> asked you to take over <strong>{offer.tripName}</strong> if they delete their account.</p>
      {offer.accepted ? <p className={settings.note}>You accepted. You&apos;ll become the organizer if they delete their account.</p>
        : offer.declined ? <p className={settings.note}>You declined.</p> : null}
      <div className={styles.row}>
        {!offer.accepted && <button type="button" className={settings.primary} disabled={busy === offer.tripId} onClick={() => answer(offer.tripId, true)}>Accept</button>}
        {!offer.declined && <button type="button" className={settings.secondary} disabled={busy === offer.tripId} onClick={() => answer(offer.tripId, false)}>Decline</button>}
      </div>
    </div>)}
    {error && <p className={settings.error} role="alert">{error}</p>}
  </>;
}
