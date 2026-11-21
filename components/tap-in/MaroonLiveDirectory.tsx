"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Search } from "lucide-react";
import { WebsiteBrand } from "@/components/marketing/WebsiteBrand";
import { LIVE_TRIP_MOCKS, type LiveTripCount } from "@/lib/website/liveTripMocks";
import { LIVE_SECTIONS, liveEventDetail, liveSection, type LiveEvent } from "@/lib/platform/liveDirectory";
import styles from "./MaroonLiveDirectory.module.css";

/**
 * The Maroon Live directory (project_specs.md, "Feature: The Maroon Live", Step 2): every Public trip, tournament and league,
 * in Live / Upcoming / Past, searchable; each opens its live page. Same screen on the website (/tap-in) and in the app
 * (Golf Trips → The Maroon Live). `sampleCount`: the dev website preview's fictional entries (nothing loaded).
 * `sample` (the dev simulator): these events instead of loading, or "unavailable" for the not-set-up message.
 */
export function MaroonLiveDirectory({ sampleCount, sample, surface = "website" }: { sampleCount?: LiveTripCount; sample?: LiveEvent[] | "unavailable"; surface?: "app" | "website" }) {
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<LiveEvent[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (sampleCount !== undefined) return;
    if (sample !== undefined) {
      const words = query.trim().toLowerCase();
      const timer = window.setTimeout(() => {
        if (sample === "unavailable") { setProblem("The Maroon Live isn't available right now."); return; }
        setEvents(sample.filter((e) => !words || `${e.name} ${e.course ?? ""}`.toLowerCase().includes(words))); setProblem(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    let current = true;
    const timer = window.setTimeout(() => {
      fetch(`/api/live?q=${encodeURIComponent(query.trim())}`).then((r) => r.json() as Promise<{ ok: boolean; events?: LiveEvent[] }>)
        .then((reply) => { if (!current) return; if (reply.ok) { setEvents(reply.events ?? []); setProblem(null); } else setProblem("The Maroon Live isn't available right now."); })
        .catch(() => { if (current) setProblem("No connection. Try again when you're back online."); });
    }, query ? 250 : 0);
    return () => { current = false; window.clearTimeout(timer); };
  }, [query, sampleCount, sample]);

  const today = new Date().toLocaleDateString("en-CA");
  const sections = events && LIVE_SECTIONS.map((name) => ({ name, events: events.filter((event) => liveSection(event, today) === name) })).filter((s) => s.events.length);
  const samples = sampleCount !== undefined ? LIVE_TRIP_MOCKS.slice(0, sampleCount) : null;

  return <main className={`${styles.page} ${surface === "app" ? styles.appPage : ""}`}>
    {surface === "app" ? <header className={styles.appHeader}>
      <Link href="/golf-trips" className={styles.appBack} aria-label="Back to Golf Trips"><ChevronLeft size={24} aria-hidden="true" /></Link>
      <h1 id="maroon-live-title">The Maroon Live</h1>
    </header> : <header className={styles.header}><WebsiteBrand href="/website" /><Link href="/website" className={styles.back}>Back to website</Link></header>}
    <section className={styles.directory} aria-labelledby="maroon-live-title">
      {surface === "website" && <h1 id="maroon-live-title" className={styles.title}>The Maroon Live</h1>}
      {samples ? <>
        <div className={styles.listHeading}><h2>Trips going on</h2><span>{samples.length} {samples.length === 1 ? "trip" : "trips"}</span></div>
        {samples.length ? <ul className={styles.list} aria-label="Trips going on">
          {samples.map(trip => <li className={styles.trip} key={trip.id}><h3>{trip.name}</h3><p>{trip.location}</p></li>)}
        </ul> : <Empty />}
      </> : <>
        <label className={styles.search}><Search size={16} aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search trips, tournaments and leagues" aria-label="Search trips, tournaments and leagues" maxLength={80} />
        </label>
        {problem ? <p className={styles.notice} role="alert">{problem}</p>
          : !sections ? <p className={styles.notice}>Loading…</p>
          : !sections.length ? (query.trim() ? <div className={styles.empty}><h3>Nothing matches “{query.trim()}”</h3><p>Try another name or course.</p></div> : <Empty />)
          : sections.map((section) => <div key={section.name} className={styles.section}>
            <div className={styles.listHeading}><h2>{section.name}</h2><span>{section.events.length}</span></div>
            <ul className={styles.list} aria-label={section.name}>
              {section.events.map((event) => <li key={`${event.kind}-${event.name}-${event.href}`} className={styles.trip}>
                <Link href={event.href} prefetch={false} className={styles.eventLink}>
                  <h3>{event.name}{section.name === "Live" && <span className={styles.livePill}>Live</span>}</h3><p>{liveEventDetail(event)}</p>
                </Link>
              </li>)}
            </ul>
          </div>)}
      </>}
    </section>
  </main>;
}

function Empty() {
  return <div className={styles.empty}><h3>Nothing live right now</h3><p>Public trips, tournaments and leagues show here. Check back soon.</p></div>;
}
