"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy } from "lucide-react";
import styles from "./GolfTripInviteDialog.module.css";

type Copied = "code" | "link" | "failed" | null;

/**
 * Shown in the middle of the screen right after Create Golf Trip saves: Congratulations, then the trip's
 * invite code (its Trip ID) and link to copy, both of which work in Golf Trips → Join a Trip.
 * Every way out (Go to My Trip, Escape, tapping outside) opens the new trip.
 */
export function GolfTripInviteDialog({ tripId, url, onDone }: { tripId: string; url: string; onDone: () => void }) {
  const doneRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<Copied>(null);

  useEffect(() => { doneRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onDone(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  async function copy(what: "code" | "link") {
    try {
      await navigator.clipboard.writeText(what === "code" ? tripId : new URL(url, window.location.origin).href);
      setCopied(what);
    } catch {
      setCopied("failed");
    }
  }

  // Portaled to the page root so no ancestor's stacking context can put the site header on top of it.
  return createPortal(
    <div onClick={onDone} className={styles.backdrop}>
      <div role="dialog" aria-modal="true" aria-labelledby="trip-invite-title" onClick={(event) => event.stopPropagation()} className={styles.dialog}>
        <h2 id="trip-invite-title" className={styles.title}>Congratulations!</h2>
        <p className={styles.subtitle}>Invite your group</p>
        <p className={styles.hint}>Send them this invite code. They paste it in Golf Trips → Join a Trip.</p>

        <div className={styles.codeRow}>
          <code className={styles.code}>{tripId}</code>
          <button type="button" className={styles.copy} onClick={() => void copy("code")} aria-label="Copy invite code">
            {copied === "code" ? <Check size={18} strokeWidth={2.5} aria-hidden="true" /> : <Copy size={18} strokeWidth={2.25} aria-hidden="true" />}
          </button>
        </div>
        <button type="button" className={styles.copyLink} onClick={() => void copy("link")}>
          {copied === "link" ? "Link copied" : "Copy invite link"}
        </button>
        <p className={styles.status} role="status">
          {copied === "code" ? "Invite code copied." : copied === "failed" ? "Couldn't copy. Press and hold the code to copy it." : ""}
        </p>

        <button ref={doneRef} type="button" className={styles.done} onClick={onDone}>Go to My Trip</button>
      </div>
    </div>,
    document.body
  );
}
