"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { tapInPath } from "@/lib/platform/tapIn";
import styles from "./GolfTripHome.module.css";
import tapStyles from "./TripTapIn.module.css";

export function TripTapInInvite({ code, name }: { code?: string | null; name: string }) {
  const path = tapInPath(code);
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const link = () => path ? new URL(path, window.location.origin).href : null;
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
    <h2 className={tapStyles.inviteTitle}>The Maroon Live</h2>
    <p className={tapStyles.description}>Invite your peers to follow along.</p>
    <div className={styles.homeInviteRow}>
      {path ? <a href={path} className={styles.homeInviteLink}>{path}</a> : <span className={styles.homeInviteLink}>The Maroon Live link unavailable</span>}
      <button type="button" className={styles.homeInviteCopy} disabled={!path} onClick={() => void copy()}>{copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {copied ? "Copied" : "Copy link"}</button>
      <button type="button" className={styles.homeInviteCopy} disabled={!path} onClick={() => void share()} aria-label="Share The Maroon Live link"><Share2 size={15} aria-hidden /></button>
    </div>
    <span className={styles.srOnly} role="status">{status}</span>
  </section>;
}
