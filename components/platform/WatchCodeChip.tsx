"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { formatCode } from "@/lib/platform/codeTournaments";
import styles from "./CodeTournament.module.css";

/** A trip's watch code for its members to pass on: tap to copy, or Share (where the phone can). */
export function WatchCodeChip({ code, name }: { code: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const shown = formatCode(code);
  const copy = () => navigator.clipboard?.writeText(shown).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return <div className={styles.watchRow}>
    <p>Anyone can follow the leaderboard with this code. They enter it on Tourneys or open the link, no account needed.</p>
    <div className={styles.organizer}>
      <button type="button" className={styles.codeChip} onClick={copy} aria-label={`Watch code ${shown}, copy`}>
        <span>Watch</span><b>{shown}</b>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      </button>
      {canShare && <button type="button" className={styles.organizerButton} onClick={() => navigator.share({ title: name, text: `Follow ${name} on The Maroon: code ${shown}`, url: `${location.origin}/watch/${code}` }).catch(() => {})}>
        <Share2 size={15} aria-hidden="true" /> Share</button>}
    </div>
  </div>;
}
