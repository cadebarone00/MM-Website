"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, MapPin, Radio, Search, X } from "lucide-react";
import { DatePicker } from "@/components/platform/DatePicker";
import { formatDateRange } from "@/lib/platform/publicSite";
import { publicSection, type PublicCodeTournament } from "@/lib/platform/codeTournaments";
import styles from "./JoinTournament.module.css";

type Found = { status: "loading" } | { status: "ok"; tournaments: PublicCodeTournament[] } | { status: "error"; message: string };
const SECTIONS = ["Live", "Upcoming", "Past"] as const;
type Section = (typeof SECTIONS)[number];

/**
 * Tourneys: find public tournaments by name or location (course, city, state) and by date (a round that day), in three
 * lists: Live (going on now), Upcoming (first round still ahead) and Past (ended). Each row opens its read-only
 * leaderboard and tee sheet (/tournaments/live/<id>). Only tournaments their organizer made public show here.
 */
export function PublicTournamentSearch() {
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [section, setSection] = useState<Section>("Live");
  const [found, setFound] = useState<Found>({ status: "loading" });
  const words = query.trim();
  useEffect(() => {
    const controller = new AbortController();
    // A short pause while typing, so each letter isn't its own search.
    const timer = window.setTimeout(() => {
      fetch(`/api/code-tournaments/public?q=${encodeURIComponent(words)}${date ? `&date=${date}` : ""}`, { cache: "no-store", signal: controller.signal })
        .then((r) => r.json() as Promise<{ ok: boolean; tournaments?: PublicCodeTournament[]; code?: string }>)
        .then((body) => setFound(body.ok ? { status: "ok", tournaments: body.tournaments ?? [] }
          : { status: "error", message: body.code === "not_installed" ? "Public tournaments aren't set up in the database yet." : "Couldn't load tournaments. Try again." }))
        .catch((e: Error) => { if (e.name !== "AbortError") setFound({ status: "error", message: "No connection. Try again when you're back online." }); });
    }, words ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [words, date]);

  const today = new Date().toLocaleDateString("en-CA");
  const all = found.status === "ok" ? found.tournaments : [];
  const shown = all.filter((t) => publicSection(t, today) === section);
  const count = (name: Section) => all.filter((t) => publicSection(t, today) === name).length;
  const filtered = Boolean(words || date);

  return <section aria-labelledby="public-tournaments-heading" className={styles.tournamentSection}>
    <h2 id="public-tournaments-heading" className={styles.descriptor}>Find a Tournament</h2>
    <div className={styles.searchPanel}>
      <label className={styles.searchRow}>
        <Search size={18} aria-hidden="true" />
        <span className={styles.srOnly}>Search tournaments by name or location</span>
        <input type="search" className={styles.searchInput} placeholder="Name or location" value={query} maxLength={60} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className={styles.searchDate}>
        <DatePicker aria-label="Tournament date" className={styles.searchInput} value={date} onChange={(e) => setDate(e.target.value)} />
        {date && <button type="button" className={styles.clearDate} aria-label="Clear date" onClick={() => setDate("")}><X size={16} aria-hidden="true" /></button>}
      </div>
    </div>
    <div className={styles.sectionTabs} role="tablist" aria-label="Tournaments">
      {SECTIONS.map((name) => <button key={name} type="button" role="tab" aria-selected={section === name} className={styles.sectionTab} onClick={() => setSection(name)}>
        {name}{found.status === "ok" && <small>{count(name)}</small>}
      </button>)}
    </div>
    <div role="tabpanel" aria-label={`${section} tournaments`}>
      {found.status === "loading" ? <p className={styles.searchNote}>Loading…</p>
        : found.status === "error" ? <p className={styles.searchNote} role="alert">{found.message}</p>
        : !shown.length ? <p className={styles.searchNote}>{filtered ? `No ${section.toLowerCase()} public tournaments match.` : section === "Live" ? "No public tournaments are going on right now." : section === "Upcoming" ? "No upcoming public tournaments." : "No past public tournaments yet."}</p>
        : <ul className={styles.list}>{shown.map((t) => <li key={t.id}>
          <Link href={`/tournaments/live/${t.id}`} className={styles.row}>
            <span className={styles.badge} aria-hidden="true">{section === "Live" ? <Radio size={20} /> : <MapPin size={20} />}</span>
            <span className={styles.rowText}>
              <strong>{t.name}</strong>
              <span>{[t.course, t.place].filter(Boolean).join(" · ")}</span>
              <span className={styles.dates}>{[t.firstDate && formatDateRange(t.firstDate, t.lastDate ?? t.firstDate), `${t.playerCount} ${t.playerCount === 1 ? "player" : "players"}`, t.scoring].filter(Boolean).join(" · ")}</span>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </li>)}</ul>}
    </div>
  </section>;
}
