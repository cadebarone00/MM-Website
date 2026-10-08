"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "./GolfTripHome";
import { golfTripUrl, tripDateRange } from "@/lib/platform/golfTripCreate";
import type { InvitationPreview } from "@/lib/platform/golfTripInvitations";
import home from "./GolfTripHome.module.css";
import styles from "./GolfTripInviteResponse.module.css";

type Viewer = "signed-out" | "no-profile" | "ok";

/**
 * What a Golf Trip invite link opens. The preview is what the server allows (trip, invited name, organizer — never the
 * invited email or who else accepted). Signed out: log in / create an account, then come back here. Signed in: Accept
 * (your profile joins the trip on that same invitation) or Decline.
 */
export function GolfTripInviteResponse({ token, invitation, viewer, loginHref, signupHref }: {
  token: string | null; invitation: InvitationPreview | null; viewer: Viewer; loginHref: string; signupHref: string;
}) {
  const router = useRouter();
  const [declined, setDeclined] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function respond(action: "accept" | "decline") {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/golf-trips/invitations/${token}${action === "decline" ? "/decline" : ""}`, { method: "POST" });
      const reply = await response.json().catch(() => null) as { ok?: boolean; url?: string; error?: string } | null;
      if (response.ok && reply?.ok) {
        if (action === "accept") {
          router.push(reply.url ?? "/golf-trips");
          router.refresh();
          return;
        }
        setDeclined(true);
      } else setError(reply?.error ?? "Something went wrong. Try again.");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
    setConfirmDecline(false);
  }

  const goToTrips = <div className={styles.actions}><Link className={styles.secondary} href="/golf-trips">Go to Golf Trips</Link></div>;
  let body;
  if (declined) {
    body = <Card title="Invitation declined">
      <p className={home.settingsNote}>You said no to this trip. If you change your mind, ask the organizer for a new invite.</p>{goToTrips}
    </Card>;
  } else if (!invitation) {
    body = <Card title="This invite link isn't valid">
      <p className={home.settingsNote}>It may have been cancelled, replaced by a newer link, or already answered. Ask the trip organizer to send you a new invite.</p>{goToTrips}
    </Card>;
  } else if (invitation.status === "claimed") {
    body = <Card title="This invitation was already accepted">
      <p className={home.settingsNote}>Someone already used this invite. If it was meant for you, ask the organizer for a new one.</p>{goToTrips}
    </Card>;
  } else if (invitation.status === "yours" || invitation.status === "already_member") {
    body = <Card title="You're already in this trip">
      <div className={styles.actions}><Link className={styles.primary} href={golfTripUrl(invitation.tripId)}>Open trip</Link></div>
    </Card>;
  } else if (viewer === "signed-out") {
    body = <Card title="Join this trip">
      <p className={home.settingsNote}>Log in or create a free account to accept or decline. You&apos;ll come right back here.</p>
      <div className={styles.actions}><Link className={styles.primary} href={loginHref}>Log in</Link><Link className={styles.secondary} href={signupHref}>Create an account</Link></div>
    </Card>;
  } else if (viewer === "no-profile") {
    body = <Card title="Finish your profile first">
      <p className={home.settingsNote}>Your account doesn&apos;t have a golfer profile yet, so it can&apos;t join a trip. Contact support to finish setting it up.</p>
    </Card>;
  } else {
    body = <Card title="Join this trip">
      {confirmDecline
        ? <div className={home.confirm} role="alertdialog" aria-label="Decline this invitation?">
          <p className={home.text}>Decline this invitation? The link will stop working.</p>
          <div className={home.confirmActions}>
            <button type="button" className={home.cancelButton} onClick={() => setConfirmDecline(false)} disabled={busy}>Back</button>
            <button type="button" className={home.deleteButton} onClick={() => respond("decline")} disabled={busy}>Decline</button>
          </div>
        </div>
        : <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => respond("accept")} disabled={busy}>{busy ? "Joining…" : "Accept"}</button>
          <button type="button" className={styles.secondary} onClick={() => setConfirmDecline(true)} disabled={busy}>Decline</button>
        </div>}
    </Card>;
  }

  const dates = invitation?.startDate && invitation.endDate ? tripDateRange(invitation.startDate, invitation.endDate) : null;
  return <main className={home.page}>
    <div className={styles.content}>
      {invitation && !declined && <header>
        <p className={styles.eyebrow}>Golf trip invitation</p>
        <h1 className={styles.tripName}>{invitation.tripName}</h1>
        <p className={styles.details}>{[dates, invitation.destination].filter(Boolean).join(" · ")}</p>
        <p className={styles.details}>{invitation.organizerName ? `${invitation.organizerName} invited ${invitation.invitedName}.` : `Invitation for ${invitation.invitedName}.`}</p>
      </header>}
      {body}
      {error && <p className={home.settingsMessage} role="alert">{error}</p>}
    </div>
  </main>;
}
