"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { InvitePreview } from "@/lib/platform/tournamentInvites";
import styles from "./PlayRound.module.css";

const handicapValue = (text: string) => { const n = Number.parseFloat(text); return Number.isFinite(n) && n >= -10 && n <= 54 ? n : null; };

/**
 * A tournament email invite. Signed out: Create a profile / Log in, both coming back to this link. Signed in: joins
 * straight away and opens the tournament (a net tournament whose file had no handicap asks for one first).
 */
export function CodeTournamentInviteResponse({ token, invite, signedIn, signupHref, loginHref }: {
  token: string | null; invite: InvitePreview | null; signedIn: boolean; signupHref: string; loginHref: string;
}) {
  const router = useRouter();
  const [handicap, setHandicap] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsHandicap = invite?.scoring === "Net" && invite.handicap === null;
  const join = useCallback(async (hcp: number | null) => {
    if (!token) return;
    setBusy(true); setError(null);
    const reply = await fetch(`/api/code-tournaments/invite/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handicap: hcp }) })
      .then((r) => r.json() as Promise<{ ok: boolean; id?: string; message?: string }>).catch(() => null);
    if (reply?.ok && reply.id) { router.replace(`/tournaments/code/${reply.id}`); return; }
    setBusy(false);
    setError(reply?.message ?? "No connection. Try again when you're back online.");
  }, [token, router]);
  // Back from making a profile (or already signed in): join without another tap.
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !signedIn || !invite || invite.status !== "live" || needsHandicap) return;
    tried.current = true;
    void join(null);
  }, [signedIn, invite, needsHandicap, join]);

  return <main className={styles.page}>
    <section className={styles.panel}>
      {!token || !invite ? <><p className={styles.kicker}>Tournament invite</p><p className={styles.error} role="alert">This invite link isn&apos;t valid. Ask the organizer for the tournament code instead.</p>
        <Link href="/tournaments/join" className={styles.secondary}>Go to Tourneys</Link></>
      : <>
        <p className={styles.kicker}>You&apos;re invited</p>
        <h1 className={styles.title}>Join {invite.tournamentName}</h1>
        <p className={styles.place}>{invite.organizerName ? `${invite.organizerName} invited ${invite.invitedName}` : `For ${invite.invitedName}`} · {invite.scoring}</p>
        {invite.status !== "live" ? <p className={styles.error} role="alert">This tournament has ended.</p>
          : !signedIn ? <div className={styles.form}>
            <p className={styles.blurb}>Make your profile first. You&apos;ll come straight back here and join the tournament.</p>
            <Link href={signupHref} className={styles.primary}>Create a profile <ArrowRight size={16} aria-hidden="true" /></Link>
            <Link href={loginHref} className={styles.secondary}>I already have one · Log in</Link>
          </div>
          : needsHandicap ? <form className={styles.form} onSubmit={(e) => { e.preventDefault(); void join(handicapValue(handicap)); }}>
            <label className={styles.field}><span>Your handicap index</span>
              <input inputMode="decimal" placeholder="e.g. 12.3" value={handicap} onChange={(e) => setHandicap(e.target.value)} /></label>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button type="submit" className={styles.primary} disabled={busy || handicapValue(handicap) === null}>{busy ? "Joining…" : "Join tournament"} <ArrowRight size={16} aria-hidden="true" /></button>
          </form>
          : <div className={styles.form}>
            {error ? <><p className={styles.error} role="alert">{error}</p>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => void join(null)}>Try again</button></>
              : <p className={styles.note}>Joining {invite.tournamentName}…</p>}
          </div>}
      </>}
    </section>
  </main>;
}
