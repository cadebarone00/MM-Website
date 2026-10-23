"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Radio, Search } from "lucide-react";
import { formatDateRange } from "@/lib/platform/publicSite";
import type { PublicCodeTournament } from "@/lib/platform/codeTournaments";
import styles from "./JoinTournament.module.css";

type Found = { status: "loading" } | { status: "ok"; tournaments: PublicCodeTournament[] } | { status: "error"; message: string };

/**
 * Tourneys: search public tournaments by name, and (with nothing typed) the Live Tournaments feed — every public
 * tournament going on right now. Each row opens its read-only leaderboard and tee sheet (/tournaments/live/<id>).
 * Only tournaments their organizer made public (Tournament Settings → Public) show here.
 */
export function PublicTournamentSearch() {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found>({ status: "loading" });
  const words = query.trim();
  useEffect(() => {
    const controller = new AbortController();
    // A short pause while typing, so each letter isn't its own search.
    const timer = window.setTimeout(() => {
      fetch(`/api/code-tournaments/public?q=${encodeURIComponent(words)}`, { cache: "no-store", signal: controller.signal })
        .then((r) => r.json() as Promise<{ ok: boolean; tournaments?: PublicCodeTournament[]; code?: string }>)
        .then((body) => setFound(body.ok ? { status: "ok", tournaments: body.tournaments ?? [] }
          : { status: "error", message: body.code === "not_installed" ? "Public tournaments aren't set up in the database yet." : "Couldn't load tournaments. Try again." }))
        .catch((e: Error) => { if (e.name !== "AbortError") setFound({ status: "error", message: "No connection. Try again when you're back online." }); });
    }, words ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [words]);

  return <section aria-labelledby="public-tournaments-heading" className={styles.tournamentSection}>
    <h2 id="public-tournaments-heading" className={styles.descriptor}>{words ? "Search results" : "Live Tournaments"}</h2>
    <label className={styles.searchRow}>
      <Search size={18} aria-hidden="true" />
      <span className={styles.srOnly}>Search tournaments</span>
      <input type="search" className={styles.searchInput} placeholder="Search tournaments by name" value={query} maxLength={60} onChange={(e) => setQuery(e.target.value)} />
    </label>
    {found.status === "loading" ? <p className={styles.note}>Loading…</p>
      : found.status === "error" ? <p className={styles.note} role="alert">{found.message}</p>
      : !found.tournaments.length ? <p className={styles.note}>{words ? `No public tournaments named "${words}".` : "No public tournaments are going on right now."}</p>
      : <ul className={styles.list}>{found.tournaments.map((t) => <li key={t.id}>
        <Link href={`/tournaments/live/${t.id}`} className={styles.row}>
          <span className={styles.badge} aria-hidden="true"><Radio size={20} /></span>
          <span className={styles.rowText}>
            <strong>{t.name}</strong>
            <span>{[t.course, `${t.playerCount} ${t.playerCount === 1 ? "player" : "players"}`, t.scoring, t.status === "ended" ? "Final" : "Live"].filter(Boolean).join(" · ")}</span>
            {t.firstDate && <span className={styles.dates}>{formatDateRange(t.firstDate, t.lastDate ?? t.firstDate)} · {t.organizerName}</span>}
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </li>)}</ul>}
  </section>;
}
