"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { calendarDate } from "@/lib/live/seasonCalendar";
import { overviewDays, overviewMatchCount, type OverviewYear, type SeasonOverviewData } from "@/lib/live/seasonOverview";
import { teeTimeSlotForMatch } from "@/lib/live/sessionTeeTimes";
import type { MatchFormat } from "@/lib/live/types";

const green = "border-green-600 bg-green-50 text-green-900";
const neutral = "border-stone-300 bg-white text-ink-700";
function YearOverview({ row, activeYear, available, refresh, now }: { row: OverviewYear; activeYear: number; available: boolean; refresh: () => Promise<void>; now: number }) {
  const [activeOn, setActiveOn] = useState(row.activeOn ?? "");
  const [passOn, setPassOn] = useState(row.passOn ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = calendarDate(new Date(now));
  const archived = (row.locked && Boolean(row.passOn && row.passOn <= today)) || (row.historical && activeYear !== row.year);
  const status = row.test ? "Test season" : archived ? "Archived" : activeYear === row.year ? "Active" : row.locked ? "Armed" : "Draft";
  async function save(locked: boolean) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/portal/tiger/season-calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year: row.year, activeOn: activeOn || null, passOn: passOn || null, locked }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not save dates.");
      await refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save dates."); }
    finally { setBusy(false); }
  }
  return <details className="group rounded-lg border border-gold-300 bg-white" open={row.year === activeYear}>
    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-4"><span className="font-serif text-xl font-bold">{row.year}</span><span className={"rounded border px-2 py-1 text-xs font-semibold " + (status === "Active" || status === "Armed" ? green : neutral)}>{status}</span><span className="text-xs text-ink-500">{row.count ?? "No"} sessions{row.countLocked ? " - count locked" : ""} - {row.locked ? "Dates locked" : "Dates not armed"}</span></summary>
    <div className="border-t border-gold-200 p-4">
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-xs font-semibold">Active<input type="date" aria-label={row.year + " Active date"} value={activeOn} onChange={event => setActiveOn(event.target.value)} disabled={row.locked || busy || row.test || !available} className={"mt-1 block w-full rounded-md border-2 p-2 text-sm disabled:opacity-100 " + (row.locked && activeOn ? green : neutral)} /></label>
        <label className="text-xs font-semibold">Pass on<input type="date" aria-label={row.year + " Pass on date"} value={passOn} onChange={event => setPassOn(event.target.value)} disabled={row.locked || busy || row.test || !available} className={"mt-1 block w-full rounded-md border-2 p-2 text-sm disabled:opacity-100 " + (row.locked && passOn ? green : neutral)} /></label>
        <div className="flex gap-3 py-2"><button type="button" onClick={() => save(!row.locked)} disabled={busy || row.test || !available} className="text-sm font-semibold text-maroon-700 underline disabled:opacity-50">{busy ? "Saving..." : row.locked ? "Unlock dates" : "Lock dates"}</button>{!row.locked && <button type="button" onClick={() => save(false)} disabled={busy || row.test || !available} className="text-sm text-ink-600 underline disabled:opacity-50">Save draft</button>}</div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-500">{row.test ? "2034 is reserved for disposable rehearsal and cannot take over the public website automatically." : "Locked dates take effect at midnight Central Time. Pass on is the next year's Active date. Scores are preserved as recorded; handoff does not finish matches."}</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4 space-y-4">{overviewDays(row).map((day,index) => <section key={day.date ?? "undated"}>
        <h3 className="mb-2 font-sans text-sm font-bold">{day.date ? "Day " + (index+1) + " - " + new Date(day.date + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) : "Date not chosen"}{row.datesLocked ? "" : " (draft dates)"}</h3>
        <div className="space-y-2">{day.sessions.map(session => {
          const count = Math.max(overviewMatchCount(session.format), ...session.matches.map(match => match.number), 0);
          return <div key={session.number} className="rounded-lg border border-stone-200 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs"><strong>Session {session.number}</strong><span>{session.course ?? "Course pending"} - {session.format ?? "Format pending"}</span><span className={"rounded border px-2 py-1 " + (session.courseLocked ? green : neutral)}>{session.courseLocked ? "Setup locked" : "Draft setup"}</span><span className={"rounded border px-2 py-1 " + (session.matchupsLocked ? green : neutral)}>{session.matchupsLocked ? "Matchups locked" : "Matchups pending"}</span>{!row.historical && <Link href={"/portal/admin/master-settings/" + row.year + "/courses-format"} className="ml-auto text-maroon-700 underline">Edit settings</Link>}</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{Array.from({length: count},(_,index) => {
              const number = index+1, match = session.matches.find(match => match.number === number);
              const slot = teeTimeSlotForMatch(session.format as MatchFormat,number);
              const time = session.teeTimes[slot];
              const label = time ? new Date("2000-01-01T" + time).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}) : match?.teeTime ? new Date(match.teeTime).toLocaleTimeString("en-US",{timeZone:row.timezone,hour:"numeric",minute:"2-digit"}) : "TBD";
              const state = archived ? "Archived" : match?.state === "Final" ? "Final" : !session.courseLocked || !session.matchupsLocked ? "Not armed" : !match ? "Match pending" : !session.started || !match.started ? "Awaiting start" : match.teeTime && Date.parse(match.teeTime) <= now ? "Live" : "Armed";
              return <div key={number} className="min-w-0 text-center"><p className="mb-1 text-xs font-semibold">Match {number}</p><div className={"rounded-md border-2 px-1 py-2 " + (session.courseLocked && label !== "TBD" ? green : neutral)}><p className="text-sm font-bold">{label}</p><p className="mt-1 text-[10px]">{state}</p></div></div>;
            })}</div>{!count && <p className="text-xs text-ink-500">Choose a format to see the match slots.</p>}
          </div>;
        })}{!day.sessions.length && <p className="text-xs text-ink-500">No sessions assigned to this day.</p>}</div>
      </section>)}</div>
      {!row.sessions.length && <p className="mt-4 text-sm text-ink-500">No sessions configured yet.</p>}
      <p className="mt-3 text-xs text-ink-500">Tee times: {row.timezone.replaceAll("_", " ")}. Green boxes are locked saved values. Armed matches still wait for their tee time; Start Session is a separate action.</p>
    </div>
  </details>;
}

export function SeasonOverview({ initial }: { initial: SeasonOverviewData }) {
  const [data,setData] = useState(initial);
  const [now,setNow] = useState(Date.parse(initial.checkedAt));
  const [error,setError] = useState<string | null>(null);
  async function refresh() {
    const response = await fetch("/api/portal/tiger/season-calendar",{cache:"no-store"});
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Could not refresh overview.");
    setData(result.overview); setNow(Date.now()); setError(null);
  }
  useEffect(() => {
    const update = () => { void refresh().catch(() => setError("Refresh failed. Showing the last saved overview.")); };
    const timer = setInterval(update,15000);
    window.addEventListener("focus",update);
    return () => { clearInterval(timer); window.removeEventListener("focus",update); };
  },[]);
  return <section className="mt-6 rounded-xl border-2 border-gold-300 bg-cream-50 p-4 sm:p-5" aria-label="Season timing overview">
    <h2 className="font-serif text-2xl font-bold">Season timing overview</h2>
    <p className="mt-2 text-sm text-ink-600">Open a year to see its handoff dates, days, sessions and match tee times. Updates from saved settings every 15 seconds.</p>
    {!data.calendarAvailable && <p role="alert" className="mt-3 text-sm text-amber-800">Calendar dates are not installed yet. Apply season_calendar.sql to enable them. Session setup below is still available.</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    <div className="mt-4 space-y-3">{data.years.map(row => <YearOverview key={row.year + ":" + row.activeOn + ":" + row.passOn + ":" + row.locked} row={row} activeYear={data.activeYear} available={data.calendarAvailable} refresh={refresh} now={now} />)}</div>
  </section>;
}
