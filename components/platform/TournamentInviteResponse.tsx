"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "./GolfTripHome";
import type { TournamentPlayerInvitation } from "@/lib/platform/tournamentPlayerInvitations";
import home from "./GolfTripHome.module.css";
import styles from "./GolfTripInviteResponse.module.css";

type Viewer = "signed-out" | "no-profile" | "ok";

/**
 * What a tournament invite link opens. The preview is what the server allows (tournament and player name — never an
 * email or anyone's profile). Signed out: log in / create an account, then come back. Signed in: Accept (your profile
 * becomes that tournament player) or Decline.
 */
export function TournamentInviteResponse({ token, invitation, viewer, loginHref, signupHref }: {
  token: string | null; invitation: TournamentPlayerInvitation | null; viewer: Viewer; loginHref: string; signupHref: string;
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
      const response = await fetch(`/api/platform/tournament-invitations/${token}${action === "decline" ? "/decline" : ""}`, { method: "POST" });
      const reply = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (response.ok && reply?.ok) {
        if (action === "accept") {
          router.push("/tournaments/mine");
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

  const toTournaments = <div className={styles.actions}><Link className={styles.secondary} href="/tournaments/mine">My Tournaments</Link></div>;
  let body;
  if (declined) {
    body = <Card title="Invitation declined">
      <p className={home.settingsNote}>You said no. If you change your mind, ask the organizer for a new invite.</p>{toTournaments}
    </Card>;
  } else if (!invitation) {
    body = <Card title="This invite link isn't valid">
      <p className={home.settingsNote}>It may have been replaced by a newer link or already answered. Ask the tournament organizer to send you a new invite.</p>{toTournaments}
    </Card>;
  } else if (invitation.status === "claimed") {
    body = <Card title="This invitation was already accepted">
      <p className={home.settingsNote}>Someone already used this invite. If it was meant for you, ask the organizer for a new one.</p>{toTournaments}
    </Card>;
  } else if (invitation.status === "yours" || invitation.status === "already_player") {
    body = <Card title="You're already playing in this tournament">{toTournaments}</Card>;
  } else if (viewer === "signed-out") {
    body = <Card title="Join this tournament">
      <p className={home.settingsNote}>Log in or create a free account to accept or decline. You&apos;ll come right back here.</p>
      <div className={styles.actions}><Link className={styles.primary} href={loginHref}>Log in</Link><Link className={styles.secondary} href={signupHref}>Create an account</Link></div>
    </Card>;
  } else if (viewer === "no-profile") {
    body = <Card title="Finish your profile first">
      <p className={home.settingsNote}>Your account doesn&apos;t have a golfer profile yet, so it can&apos;t join a tournament. Contact support to finish setting it up.</p>
    </Card>;
  } else {
    body = <Card title="Join this tournament">
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

  return <main className={home.page}>
    <div className={styles.content}>
      {invitation && !declined && <header>
        <p className={styles.eyebrow}>Tournament invitation</p>
        <h1 className={styles.tripName}>{invitation.tournamentName}</h1>
        <p className={styles.details}>You&apos;re invited to play as {invitation.playerName}.</p>
      </header>}
      {body}
      {error && <p className={home.settingsMessage} role="alert">{error}</p>}
    </div>
  </main>;
}
