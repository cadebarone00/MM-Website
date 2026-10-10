"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { gameDef } from "@/lib/platform/roundGames";
import type { RoundInvite } from "@/lib/platform/sharedRoundsServer";
import styles from "./MobileHome.module.css";

/**
 * Play page: invites to rounds with friends ("Cam invited you to play Pebble Beach · Wolf"). Join opens the round on
 * this phone; Decline drops it. Shows nothing when there are none (or when signed out / not set up yet).
 */
export function RoundInvites() {
  const router = useRouter();
  const [invites, setInvites] = useState<RoundInvite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/rounds/invites", { cache: "no-store" }).then((r) => r.json() as Promise<{ invites?: RoundInvite[] }>)
      .then((body) => setInvites(body.invites ?? [])).catch(() => { /* nothing to show */ });
  }, []);
  async function answer(roundId: string, join: boolean) {
    setBusy(roundId); setError(null);
    const response = await fetch(`/api/rounds/shared/${encodeURIComponent(roundId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: join ? "join" : "decline" }) }).catch(() => null);
    setBusy(null);
    if (!response?.ok) { setError("That invite is no longer open."); setInvites((all) => all.filter((i) => i.roundId !== roundId)); return; }
    if (join) { router.push(`/rounds/new?round=${roundId}`); return; }
    setInvites((all) => all.filter((i) => i.roundId !== roundId));
  }
  if (!invites.length && !error) return null;
  return <div className={styles.invites} aria-label="Round invites">
    {invites.map((invite) => <article key={invite.roundId} className={styles.invite}>
      <p><b>{invite.hostName}</b> invited you to play <b>{invite.setup.course.name}</b>{invite.setup.game ? ` · ${gameDef(invite.setup.game.id).name}` : ""}</p>
      <div>
        <button type="button" disabled={busy === invite.roundId} onClick={() => answer(invite.roundId, true)}>Join</button>
        <button type="button" disabled={busy === invite.roundId} onClick={() => answer(invite.roundId, false)}>Decline</button>
      </div>
    </article>)}
    {error && <p role="alert" className={styles.inviteError}>{error}</p>}
  </div>;
}
