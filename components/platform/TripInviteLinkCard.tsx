"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { shareLink } from "@/lib/platform/shareLink";
import { useTripJoinLink } from "@/lib/platform/useTripJoinLink";
import type { JoinLink } from "@/lib/platform/golfTripJoinLinks";
import styles from "./TripInviteLinkCard.module.css";

type Status = "" | "copied" | "shared" | "failed" | "reset";
const SAMPLE: JoinLink = { code: "sample-link-0123456789abcdefghij", url: "https://maroon.app/golf-trips/join/sample-link", expiresAt: "2999-01-01T00:00:00Z" };

/**
 * Settings → General → Players, at the very top: the trip's invite link (lasts 30 minutes) with Copy and Share for
 * everyone, and Reset link for the organizer. `tripId` null = the /dev preview (sample link, nothing is sent).
 * Always the same height, whatever state it's in.
 */
export function TripInviteLinkCard({ tripId, tripName, canReset }: { tripId: string | null; tripName: string; canReset: boolean }) {
  const { state, fresh, reset } = useTripJoinLink(tripId, tripId ? undefined : SAMPLE);
  const [status, setStatus] = useState<Status>("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copy() {
    const link = await fresh();
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setStatus("copied"); } catch { setStatus("failed"); }
  }
  async function share() {
    const link = await fresh();
    if (!link) return;
    const outcome = await shareLink({ title: tripName, text: `Join ${tripName} on The Maroon`, url: link.url });
    setStatus(outcome === "cancelled" ? "" : outcome);
  }
  async function doReset() {
    setBusy(true);
    if (await reset()) setStatus("reset");
    setBusy(false);
    setConfirmReset(false);
  }

  const off = state.status === "off";
  const line = off ? "Invite links aren't switched on yet." : state.status === "error" ? state.message
    : status === "copied" ? "Link copied" : status === "shared" ? "Shared" : status === "reset" ? "New link made. The old one stopped working."
    : status === "failed" ? "Couldn't copy. Press and hold the link to copy it." : "Works for 30 minutes. Copy again any time for a fresh one.";

  return <section className={styles.card} aria-label="Invite link">
    <h2 className={styles.title}>Invite link</h2>
    <p className={styles.link} aria-busy={state.status === "loading"}>{state.link ? state.link.url : state.status === "loading" ? "Getting your link…" : "—"}</p>
    {confirmReset
      ? <div className={styles.actions} role="group" aria-label="Reset the invite link?">
        <button type="button" className={styles.secondary} onClick={() => setConfirmReset(false)} disabled={busy}>Cancel</button>
        <button type="button" className={styles.primary} onClick={() => void doReset()} disabled={busy}>{busy ? "Resetting…" : "Reset"}</button>
      </div>
      : <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => void copy()} disabled={!state.link || off}>
          {status === "copied" ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} Copy
        </button>
        <button type="button" className={styles.primary} onClick={() => void share()} disabled={!state.link || off}><Share2 size={16} aria-hidden /> Share</button>
        {canReset && <button type="button" className={styles.secondary} onClick={() => setConfirmReset(true)} disabled={!state.link || off}>Reset link</button>}
      </div>}
    <p className={styles.status} role="status">{confirmReset ? "Reset makes a new link. The old one stops working right away." : line}</p>
  </section>;
}
