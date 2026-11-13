"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { formatCode } from "@/lib/platform/codeTournaments";
import { gameDef, type GameId } from "@/lib/platform/roundGames";
import type { RoundLookup } from "@/lib/platform/joinCodesServer";
import styles from "./PlayRound.module.css";

type Look = { status: "loading" } | { status: "found"; r: RoundLookup } | { status: "missing" } | { status: "error"; message: string };
const holesLabel = (holes: string | null) => holes === "front" ? "Front 9" : holes === "back" ? "Back 9" : "18 holes";

/**
 * Join a friend's round with its code (/rounds/join?code=…, from the Play page's Join a Round card or a shared link): what
 * the round is, then Join, which opens it on this phone (Play a round). Up to 5 players.
 */
export function RoundJoinPage() {
  return <Suspense><FromQuery /></Suspense>;
}
function FromQuery() {
  const code = (useSearchParams().get("code") ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return <RoundJoin code={code} />;
}

function RoundJoin({ code }: { code: string }) {
  const router = useRouter();
  const [look, setLook] = useState<Look>(code.length === 6 ? { status: "loading" } : { status: "missing" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (code.length !== 6) return;
    fetch(`/api/rounds/join?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok: boolean; round?: RoundLookup | null; code?: string }>)
      .then((body) => setLook(body.ok ? body.round ? { status: "found", r: body.round } : { status: "missing" }
        : { status: "error", message: body.code === "not_installed" ? "Round codes aren't set up in the database yet (supabase/join_codes.sql)." : body.code === "signed_out" ? "Log in to join this round." : "Couldn't look up that code. Try again." }))
      .catch(() => setLook({ status: "error", message: "No connection. Try again when you're back online." }));
  }, [code]);

  async function join() {
    setBusy(true); setError(null);
    const reply = await fetch("/api/rounds/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) })
      .then((r) => r.json() as Promise<{ ok: boolean; id?: string; message?: string }>).catch(() => null);
    setBusy(false);
    if (reply?.ok && reply.id) { router.push(`/rounds/new?round=${reply.id}`); return; }
    setError(reply?.message ?? (reply === null ? "No connection. Try again when you're back online." : "Couldn't join the round. Try again."));
  }

  const game = look.status === "found" && look.r.game ? gameDef(look.r.game as GameId)?.name : null;
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.back} aria-label="Back to Play"><ArrowLeft size={18} aria-hidden="true" /></Link><p className={styles.kicker}>Join a round{code.length === 6 ? ` · ${formatCode(code)}` : ""}</p></header>
    <section className={styles.panel}>
      {look.status === "loading" ? <p className={styles.note}>Looking up the code…</p>
        : look.status === "missing" ? <><p className={styles.error} role="alert">{code.length === 6 ? `No round has the code ${formatCode(code)}. Check it with your friend and try again.` : "That link is missing its code."}</p><Link href="/" className={styles.secondary}>Back to Play</Link></>
        : look.status === "error" ? <p className={styles.error} role="alert">{look.message}</p>
        : <><h1 className={styles.title}>{look.r.course ?? "A round"}</h1>
          <p className={styles.place}>{[holesLabel(look.r.holes), game, `Hosted by ${look.r.hostName}`, `${look.r.playerCount} of 5 players`].filter(Boolean).join(" · ")}</p>
          <form className={styles.form} onSubmit={(e) => { e.preventDefault(); void join(); }}>
            {look.r.member ? <Link href={`/rounds/new?round=${look.r.roundId}`} className={styles.primary}>You&apos;re in. Open the round <ArrowRight size={16} aria-hidden="true" /></Link>
              : look.r.status === "ended" ? <p className={styles.error} role="alert">This round has ended.</p>
              : look.r.playerCount >= 5 ? <p className={styles.error} role="alert">This round is full (5 players).</p>
              : <>
                <p className={styles.blurb}>You&apos;ll enter your own scores on your phone, and everyone in the round sees them.</p>
                {error && <p className={styles.error} role="alert">{error}</p>}
                <button type="submit" className={styles.primary} disabled={busy}>{busy ? "Joining…" : "Join round"} <ArrowRight size={16} aria-hidden="true" /></button>
              </>}
          </form></>}
    </section>
  </main>;
}
