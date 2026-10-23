"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { formatCode, type CodeTournamentLookup } from "@/lib/platform/codeTournaments";
import styles from "./PlayRound.module.css";
import own from "./CodeTournament.module.css";

type Look = { status: "loading" } | { status: "found"; t: CodeTournamentLookup } | { status: "missing" } | { status: "error"; message: string };
const handicapValue = (text: string) => { const n = Number.parseFloat(text); return Number.isFinite(n) && n >= -10 && n <= 54 ? n : null; };
const roundDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/**
 * The code's tournament (name, organizer, rounds) with Join — a handicap index first for net — or Open if I'm already in.
 * `sample` (app simulator only): shows that tournament for the code; Join saves nothing.
 */
export function CodeTournamentJoin({ code, sample }: { code: string; sample?: CodeTournamentLookup }) {
  const router = useRouter();
  const [look, setLook] = useState<Look>(sample ? { status: "found", t: sample } : { status: "loading" });
  const [handicap, setHandicap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (sample) return;
    fetch(`/api/code-tournaments/lookup?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok: boolean; tournament?: CodeTournamentLookup | null; code?: string }>)
      .then((body) => setLook(body.ok ? body.tournament ? { status: "found", t: body.tournament } : { status: "missing" }
        : { status: "error", message: body.code === "not_installed" ? "Tournaments aren't set up in the database yet." : "Couldn't look up that code. Try again." }))
      .catch(() => setLook({ status: "error", message: "No connection. Try again when you're back online." }));
  }, [code, sample]);

  async function join(t: CodeTournamentLookup) {
    if (sample) { setError("Sample tournament: joining isn't saved in the simulator."); return; }
    setBusy(true); setError(null);
    const reply = await fetch("/api/code-tournaments/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, handicap: handicapValue(handicap) }) })
      .then((r) => r.json() as Promise<{ ok: boolean; id?: string; message?: string }>).catch(() => null);
    setBusy(false);
    if (reply?.ok && reply.id) { router.push(`/tournaments/code/${reply.id}`); return; }
    setError(reply?.message ?? (reply === null ? "No connection. Try again when you're back online." : `Couldn't join ${t.name}. Try again.`));
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/tournaments/join" className={styles.back} aria-label="Back to Tourneys"><ArrowLeft size={18} aria-hidden="true" /></Link><p className={styles.kicker}>Join with code · {formatCode(code)}</p></header>
    <section className={styles.panel}>
      {look.status === "loading" ? <p className={styles.note}>Looking up the code…</p>
        : look.status === "missing" ? <><p className={styles.error} role="alert">No tournament has the code {formatCode(code)}. Check it with your organizer and try again.</p><Link href="/tournaments/join" className={styles.secondary}>Try another code</Link></>
        : look.status === "error" ? <p className={styles.error} role="alert">{look.message}</p>
        : <><h1 className={styles.title}>{look.t.name}</h1>
          <p className={styles.place}>Organized by {look.t.organizerName} · {look.t.scoring} · {look.t.playerCount} {look.t.playerCount === 1 ? "player" : "players"}</p>
          <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void join(look.t); }}>
          <ol className={own.roundList}>{look.t.rounds.map((r) => <li key={r.number}><span><b>Round {r.number}</b> · {r.course}<small>{roundDate(r.date)}</small></span></li>)}</ol>
          {look.t.member ? <Link href={`/tournaments/code/${look.t.id}`} className={styles.primary}>You&apos;re in. Open tournament <ArrowRight size={16} aria-hidden="true" /></Link>
            : look.t.status === "ended" ? <p className={styles.error} role="alert">This tournament has ended.</p>
            : <>
              {look.t.scoring === "Net" && <label className={styles.field}><span>Your handicap index</span>
                <input inputMode="decimal" placeholder="e.g. 12.3" value={handicap} onChange={(event) => setHandicap(event.target.value)} />
                <small className={styles.blurb}>Net scoring: your strokes come off on the hardest holes first.</small></label>}
              {error && <p className={styles.error} role="alert">{error}</p>}
              <button type="submit" className={styles.primary} disabled={busy || (look.t.scoring === "Net" && handicapValue(handicap) === null)}>{busy ? "Joining…" : "Join tournament"} <ArrowRight size={16} aria-hidden="true" /></button>
            </>}
        </form></>}
    </section>
  </main>;
}
