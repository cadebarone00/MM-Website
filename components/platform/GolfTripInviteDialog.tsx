"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy } from "lucide-react";
import { shareLink } from "@/lib/platform/shareLink";
import { useTripJoinLink } from "@/lib/platform/useTripJoinLink";
import styles from "./GolfTripInviteDialog.module.css";

type Status = "copied" | "shared" | "failed" | null;

/**
 * Shown right after Trip Builder creates a trip (after "Your trip is ready"): the trip's invite link — it lasts 30
 * minutes and anyone who opens it can sign up and join — with Copy, Share (the phone's own share sheet) and Done.
 * Before the join-link SQL is installed it falls back to the trip page link and the Trip ID (Golf Trips → Join a Trip).
 * Every way out (Done, Escape, tapping outside) opens the new trip.
 */
export function GolfTripInviteDialog({ tripId, tripName = "Golf trip", url, onDone }: { tripId: string; tripName?: string; url: string; onDone: () => void }) {
  const doneRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<Status>(null);
  const { state, fresh } = useTripJoinLink(tripId);
  const off = state.status === "off" || state.status === "error";

  useEffect(() => { doneRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  const linkNow = async () => off ? new URL(url, window.location.origin).href : (await fresh())?.url ?? null;
  async function copy() {
    const link = await linkNow();
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setStatus("copied"); } catch { setStatus("failed"); }
  }
  async function share() {
    const link = await linkNow();
    if (!link) return;
    const outcome = await shareLink({ title: tripName, text: `Join ${tripName} on The Maroon`, url: link });
    setStatus(outcome === "cancelled" ? null : outcome);
  }

  const shown = off ? tripId : state.link?.url ?? "Getting your link…";
  // Portaled to the page root so no ancestor's stacking context can put the site header on top of it.
  return createPortal(
    <div onClick={onDone} className={styles.backdrop}>
      <div role="dialog" aria-modal="true" aria-labelledby="trip-invite-title" onClick={(event) => event.stopPropagation()} className={styles.dialog}>
        <h2 id="trip-invite-title" className={styles.title}>Invite your crew</h2>
        <p className={styles.hint}>{off ? "Send them this invite code. They paste it in Golf Trips → Join a Trip." : "Anyone with this link can join. It works for 30 minutes."}</p>

        <div className={styles.codeRow}>
          <code className={styles.code}>{shown}</code>
          <button type="button" className={styles.copy} onClick={() => void copy()} aria-label="Copy invite link" disabled={!off && !state.link}>
            {status === "copied" ? <Check size={18} strokeWidth={2.5} aria-hidden="true" /> : <Copy size={18} strokeWidth={2.25} aria-hidden="true" />}
          </button>
        </div>
        <button type="button" className={styles.copyLink} onClick={() => void share()} disabled={!off && !state.link}>Share…</button>
        <p className={styles.status} role="status">
          {status === "copied" ? "Link copied" : status === "shared" ? "Shared" : status === "failed" ? "Couldn't copy. Press and hold the link to copy it." : ""}
        </p>

        <button ref={doneRef} type="button" className={styles.done} onClick={onDone}>Done</button>
      </div>
    </div>,
    document.body
  );
}
