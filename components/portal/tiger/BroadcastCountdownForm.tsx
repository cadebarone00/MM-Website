"use client";

import { useEffect, useState, type FormEvent } from "react";
import { TIMEZONES } from "@/lib/data/timezones";
import type { WatchCountdownSettings } from "@/lib/countdown";

export function BroadcastCountdownForm() {
  const [draft, setDraft] = useState({ title: "", date: "", time: "", timezone: "America/Los_Angeles" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const response = await fetch("/api/countdown?source=watch-live", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load the countdown. Check that the broadcast_countdown migration is installed.");
        const { target } = await response.json() as { target: WatchCountdownSettings | null };
        if (alive && target) setDraft({ title: target.title, date: target.date, time: target.time, timezone: target.timezone });
      } catch (err) { if (alive) setError(err instanceof Error ? err.message : "Countdown unavailable."); }
      finally { if (alive) setLoading(false); }
    }
    void load();
    return () => { alive = false; };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch("/api/portal/tiger/broadcast/countdown", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save countdown.");
      setSaved(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save countdown."); }
    finally { setBusy(false); }
  }

  const inputClass = "mt-1 w-full rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm";
  return <section className="my-4 rounded-lg border-2 border-stone-300 p-4">
    <h2 className="font-serif text-lg font-bold text-ink-900">Watch Live countdown</h2>
    <p className="mt-1 text-xs text-ink-600">Set the event shown before the broadcast goes live. Saving updates Watch Live within 10 seconds, including during rehearsal.</p>
    <form onSubmit={save} className="mt-3">
      <fieldset disabled={loading || busy} className="grid gap-3 sm:grid-cols-2 disabled:opacity-50">
        <label className="text-xs text-ink-700 sm:col-span-2">Event name<input required maxLength={120} value={draft.title} onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setSaved(false); }} className={inputClass} placeholder="Maroon Masters On The Range" /></label>
        <label className="text-xs text-ink-700">Date<input required type="date" value={draft.date} onChange={(e) => { setDraft({ ...draft, date: e.target.value }); setSaved(false); }} className={inputClass} /></label>
        <label className="text-xs text-ink-700">Time<input required type="time" value={draft.time} onChange={(e) => { setDraft({ ...draft, time: e.target.value }); setSaved(false); }} className={inputClass} /></label>
        <label className="text-xs text-ink-700">Time zone<select value={draft.timezone} onChange={(e) => { setDraft({ ...draft, timezone: e.target.value }); setSaved(false); }} className={inputClass}>{TIMEZONES.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}</select></label>
        <div className="flex items-end"><button type="submit" className="rounded-lg bg-maroon-700 px-4 py-2 text-sm font-semibold text-white">{busy ? "Saving..." : "Save countdown"}</button></div>
      </fieldset>
      {loading && <p role="status" className="mt-2 text-xs">Loading countdown...</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {saved && <p role="status" className="mt-2 text-sm text-green-700">Watch Live countdown saved.</p>}
    </form>
  </section>;
}
