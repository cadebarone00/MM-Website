"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Share2 } from "lucide-react";
import { tapInPath } from "@/lib/platform/tapIn";
import styles from "./GolfTripHome.module.css";
import tapStyles from "./TripTapIn.module.css";
import { shareOrigin } from "@/lib/app/shareOrigin";

export function TripTapInInvite({ code, name }: { code?: string | null; name: string }) {
  const path = tapInPath(code);
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState(false);
  // Shared links use the live website, never the app's own address (lib/app/shareOrigin.ts).
  const link = () => path ? new URL(path, shareOrigin()).href : null;
  async function copy() {
    const url = link();
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setStatus("The Maroon Live link copied"); }
    catch { setStatus("Couldn't copy. Open The Maroon Live link and copy its address."); }
  }
  async function share() {
    const url = link();
    if (!url) return;
    if (!navigator.share) { await copy(); return; }
    try { await navigator.share({ title: name, text: `Follow ${name} on The Maroon Live`, url }); }
    catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setStatus("Couldn't share. Use Copy link."); }
  }
  return <section className={tapStyles.invite} aria-label="The Maroon Live invite">
    <div className={tapStyles.inviteHeading}>
      <h2 className={tapStyles.inviteTitle}>The Maroon Live</h2>
      {path ? <Link href={path} prefetch={false} className={tapStyles.view} aria-label="View The Maroon Live">View</Link>
        : <button type="button" className={tapStyles.view} disabled title="The Maroon Live link unavailable">View</button>}
    </div>
    <p className={tapStyles.description}>Invite your peers to follow along.</p>
    <div className={styles.homeInviteRow}>
      {path ? <a href={path} className={styles.homeInviteLink}>{path}</a> : <span className={styles.homeInviteLink}>The Maroon Live link unavailable</span>}
      <button type="button" className={styles.homeInviteCopy} disabled={!path} onClick={() => void copy()}>{copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {copied ? "Copied" : "Copy link"}</button>
      <button type="button" className={styles.homeInviteCopy} disabled={!path} onClick={() => void share()} aria-label="Share The Maroon Live link"><Share2 size={15} aria-hidden /></button>
    </div>
    <span className={styles.srOnly} role="status">{status}</span>
  </section>;
}
