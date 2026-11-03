"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "./GolfTripHome";
import { golfTripUrl, tripDateRange } from "@/lib/platform/golfTripCreate";
import { joinResultFromJson, type JoinPreview } from "@/lib/platform/golfTripJoinLinks";
import type { JoinPageState } from "@/lib/platform/joinPageState";
import home from "./GolfTripHome.module.css";
import styles from "./GolfTripInviteResponse.module.css";

/** "Join this trip" — what a trip's shareable link opens. Same look as the per-person invite page. */
export function GolfTripJoinLink({ code, preview, state, signupHref, loginHref }: {
  code: string | null; preview: JoinPreview | null; state: JoinPageState; signupHref: string; loginHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);

  async function join() {
    if (!code) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/golf-trips/join/${code}`, { method: "POST" });
      const reply = await response.json().catch(() => null);
      const result = joinResultFromJson(reply);
      if (response.ok && (result.status === "joined" || result.status === "already_member")) {
        router.replace(golfTripUrl(result.tripId));
        router.refresh();
        return;
      }
      if (result.status === "expired") setExpired(true);
      else setError((reply as { error?: string } | null)?.error ?? "This invite link isn't working anymore.");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  const shown = expired ? "expired" : state;
  const goToTrips = <div className={styles.actions}><Link className={styles.secondary} href="/golf-trips">Go to Golf Trips</Link></div>;
  let body;
  if (shown === "invalid") {
    body = <Card title="This invite link isn't working">
      <p className={home.settingsNote}>It may have been replaced by a newer link. Ask the organizer for a new one.</p>{goToTrips}
    </Card>;
  } else if (shown === "expired") {
    body = <Card title="This invite link expired">
      <p className={home.settingsNote}>Invite links last 30 minutes. Ask anyone on the trip to send you a new one.</p>{goToTrips}
    </Card>;
  } else if (shown === "member" && preview) {
    body = <Card title="You're already in this trip">
      <div className={styles.actions}><Link className={styles.primary} href={golfTripUrl(preview.tripId)}>Open trip</Link></div>
    </Card>;
  } else if (shown === "signed-out") {
    body = <Card title="Join this trip">
      <p className={home.settingsNote}>Make a free account to join. You&apos;ll come right back here.</p>
      <div className={styles.actions}><Link className={styles.primary} href={signupHref}>Sign up to join</Link><Link className={styles.secondary} href={loginHref}>I already have an account</Link></div>
    </Card>;
  } else {
    body = <Card title="Join this trip">
      <div className={styles.actions}><button type="button" className={styles.primary} onClick={join} disabled={busy}>{busy ? "Joining…" : "Join trip"}</button></div>
    </Card>;
  }

  const dates = preview ? tripDateRange(preview.startDate, preview.endDate) : null;
  return <main className={home.page}>
    <div className={styles.content}>
      {preview && shown !== "invalid" && <header>
        <p className={styles.eyebrow}>Golf trip invite</p>
        <h1 className={styles.tripName}>{preview.tripName}</h1>
        <p className={styles.details}>{[dates, preview.destination].filter(Boolean).join(" · ")}</p>
        {preview.organizerName && <p className={styles.details}>Organized by {preview.organizerName}</p>}
      </header>}
      {body}
      {error && <p className={home.settingsMessage} role="alert">{error}</p>}
    </div>
  </main>;
}
