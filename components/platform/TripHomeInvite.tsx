"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTripJoinLink } from "@/lib/platform/useTripJoinLink";
import type { JoinLink } from "@/lib/platform/golfTripJoinLinks";
import type { HomeInviteStage } from "@/lib/dev/homeSections";
import styles from "./GolfTripHome.module.css";

const SAMPLE: JoinLink = { code: "sample-link-0123456789abcdefghij", url: "https://maroon.app/golf-trips/join/sample-link", expiresAt: "2999-01-01T00:00:00Z" };

/**
 * Trip Home → Invite link (below the Players heading, above the roster): the trip's invite link (lasts 30 minutes, same link as Settings → Players)
 * and a Copy link button. `tripId` null = a preview (sample link). `stage` = a simulator Conditional forcing one state.
 * Always the same height, whatever state it's in.
 */
export function TripHomeInvite({ tripId, stage }: { tripId: string | null; stage?: Exclude<HomeInviteStage, "source"> }) {
  // No trip id: dev previews get the sample link; a trip that isn't saved yet has no link to give.
  const preview = !tripId && process.env.NODE_ENV === "development";
  const { state, fresh } = useTripJoinLink(tripId, preview ? SAMPLE : undefined);
  const [copied, setCopied] = useState<"" | "copied" | "failed">("");
  const status = stage === "loading" ? "loading" : stage === "off" ? "off" : stage === "ready" || stage === "copied" ? "ok" : !tripId && !preview ? "unsaved" : state.status;
  const link = stage === "loading" || stage === "off" || status === "unsaved" ? null : stage ? SAMPLE : state.link;
  const shownCopied = stage === "copied" ? "copied" : copied;

  async function copy() {
    const current = stage ? SAMPLE : await fresh();
    if (!current) return;
    try { await navigator.clipboard.writeText(current.url); setCopied("copied"); } catch { setCopied("failed"); }
    window.setTimeout(() => setCopied(""), 2500);
  }

  // No note under the box (owner): when there's no link, the box itself says why.
  const boxText = link ? link.url : status === "loading" ? "Getting your link…" : status === "unsaved" ? "Link shows once the trip is saved"
    : status === "off" ? "Invite links aren't switched on yet" : status === "error" ? state.message : "—";

  return <section className={styles.homeInvite} aria-label="Invite players">
    <div className={styles.homeInviteRow}>
      <span className={styles.homeInviteLink} aria-busy={status === "loading"} title={boxText}>{boxText}</span>
      <button type="button" className={styles.homeInviteCopy} onClick={() => void copy()} disabled={!link || status !== "ok"}>
        {shownCopied === "copied" ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {shownCopied === "copied" ? "Copied" : shownCopied === "failed" ? "Hold link to copy" : "Copy link"}
      </button>
    </div>
    <span className={styles.srOnly} role="status">{shownCopied === "copied" ? "Link copied" : shownCopied === "failed" ? "Couldn't copy. Press and hold the link to copy it." : ""}</span>
  </section>;
}
