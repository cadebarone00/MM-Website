"use client";
import { useState } from "react";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import styles from "./InvitePreview.module.css";

const invitations: Record<string, { type: string; name: string; action: string; location?: string }> = {
  "trip-accept": { type: "Trip", name: "Bandon 2027", location: "Bandon, OR", action: "Join Trip" },
  "tourney-accept": { type: "Tournament", name: "The Maroon Invitational", action: "Join Tournament" },
  "league-accept": { type: "League", name: "Thursday Golf League", action: "Join League" },
  "play-accept": { type: "Round", name: "Saturday Golf", action: "Join Round" },
};
export function InvitePreview({ screen }: { screen: string }) {
  const [joined, setJoined] = useState(false);
  const invite = invitations[screen];
  return <main className={styles.page}><section className={styles.content} aria-labelledby="invite-heading">
    <h1 id="invite-heading">You&apos;ve been invited to a {invite.type}</h1>
    <p className={styles.event}>{invite.name}</p>{invite.location && <p className={styles.location}>{invite.location}</p>}
    <p className={styles.by}>by</p>
    <div className={styles.inviter}><ProfileAvatar name="Cade Barone" size={64} /><span><strong>Cade Barone</strong><small>@cadebarone</small></span></div>
    <button type="button" className={styles.join} onClick={() => setJoined(true)} disabled={joined}>{joined ? "Joined" : invite.action}</button>
  </section></main>;
}
