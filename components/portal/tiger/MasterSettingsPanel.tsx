"use client";

import { useState } from "react";
import Link from "next/link";
import type { TournamentSettings } from "@/lib/live/types";

const SETUP_BOXES = [
  { label: "Players & Teams", path: "players-teams" },
  { label: "Courses & Format", path: "courses-format" },
  { label: "Matchups", path: "matchups" },
];

export function MasterSettingsPanel({ year, initialSettings, isActiveYear }: { year: number; initialSettings: TournamentSettings; isActiveYear: boolean }) {
  const [beginDate, setBeginDate] = useState(initialSettings.beginDate ?? "");
  const [endDate, setEndDate] = useState(initialSettings.endDate ?? "");
  const [datesLocked, setDatesLocked] = useState(initialSettings.datesLocked);
  const [venueName, setVenueName] = useState(initialSettings.venueName ?? "");
  const [venueLocked, setVenueLocked] = useState(initialSettings.venueLocked);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingActive, setSettingActive] = useState(false);

  async function save() {
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/portal/tiger/master-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year, beginDate: beginDate || null, endDate: endDate || null, datesLocked, venueName: venueName.trim() || null, venueLocked }) });
      const data = await response.json();
      if (!data.ok) { setError(data.error); return; }
      window.location.reload();
    } finally { setSaving(false); }
  }

  async function setActiveYear() {
    if (!window.confirm(`Make ${year} the active year? This is what the public site and player scoring will follow.`)) return;
    setSettingActive(true); setError(null);
    try {
      const response = await fetch("/api/portal/tiger/active-season", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year }) });
      const data = await response.json();
      if (!data.ok) { setError(data.error); return; }
      window.location.reload();
    } finally { setSettingActive(false); }
  }

  return <div className="mt-6">
    {error && <p className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
    <div className="mt-3">{isActiveYear ? <span className="rounded-full bg-maroon-700 px-3 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white">Active Year</span> : <button type="button" disabled={settingActive} onClick={setActiveYear} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:opacity-50">{settingActive ? "Setting…" : "Set as Active Year"}</button>}</div>

    <section className="mt-6 rounded-lg border-2 border-stone-300 p-4">
      <div className="flex items-center justify-between"><h2 className="font-serif text-lg font-bold text-ink-900">Tournament Dates</h2><button type="button" disabled={!datesLocked && (!beginDate || !endDate)} onClick={() => setDatesLocked((value) => !value)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:opacity-50">{datesLocked ? "Unlock" : "Lock"}</button></div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1 font-sans text-xs text-ink-700">Begin Date<input type="date" value={beginDate} disabled={datesLocked} onChange={(event) => setBeginDate(event.target.value)} className="rounded-lg border-2 border-stone-300 px-2 py-2 text-sm" /></label><label className="flex flex-col gap-1 font-sans text-xs text-ink-700">End Date<input type="date" value={endDate} disabled={datesLocked} onChange={(event) => setEndDate(event.target.value)} className="rounded-lg border-2 border-stone-300 px-2 py-2 text-sm" /></label></div>
    </section>

    <section className="mt-4 rounded-lg border-2 border-stone-300 p-4">
      <div className="flex items-center justify-between"><h2 className="font-serif text-lg font-bold text-ink-900">Venue Name</h2><button type="button" disabled={!venueLocked && !venueName.trim()} onClick={() => setVenueLocked((value) => !value)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:opacity-50">{venueLocked ? "Unlock" : "Lock"}</button></div>
      <input type="text" value={venueName} disabled={venueLocked} onChange={(event) => setVenueName(event.target.value)} placeholder="e.g. Mission Hills CC" className="mt-3 w-full rounded-lg border-2 border-stone-300 px-2 py-2 text-sm" />
    </section>

    <button type="button" disabled={saving} onClick={save} className="mt-4 rounded-lg bg-maroon-700 px-5 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">{SETUP_BOXES.map((box) => <Link key={box.path} href={`/portal/admin/master-settings/${year}/${box.path}`} className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800">{box.label}</Link>)}<Link href="/portal/admin/scorecards" className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800">Scorecards & Video</Link><Link href="/portal/admin/scoring-preview" className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-6 py-8 text-center font-serif text-xl font-bold text-white transition hover:bg-maroon-800">Live Scoring Preview</Link></div>
  </div>;
}
