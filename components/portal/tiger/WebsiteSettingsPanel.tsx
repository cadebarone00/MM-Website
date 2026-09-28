"use client";

import { useEffect, useRef, useState } from "react";
import { DISPLAY_YEARS, WEBSITE_SECTIONS, type WebsiteSection, type WebsiteYearSettings } from "@/lib/website/settings";

export function WebsiteSettingsPanel({ initial, available, onlySection, onSaved }: {
  initial: WebsiteYearSettings; available: boolean; onlySection?: WebsiteSection; onSaved?: () => void;
}) {
  const [saved, setSaved] = useState(initial);
  const [drafts, setDrafts] = useState(initial);
  const [ready, setReady] = useState(available);
  const [busy, setBusy] = useState<WebsiteSection | null>(null);
  const [message, setMessage] = useState("");
  const dirty = useRef(new Set<WebsiteSection>());
  const writing = useRef(false);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (writing.current) return;
      try {
        const response = await fetch("/api/portal/tiger/website-settings", { cache: "no-store" });
        if (!response.ok) return;
        const data: { settings: WebsiteYearSettings; available: boolean } = await response.json();
        if (!alive || writing.current) return;
        setReady(data.available);
        setSaved(data.settings);
        setDrafts(current => Object.fromEntries(WEBSITE_SECTIONS.map(({ key }) => [key, dirty.current.has(key) ? current[key] : data.settings[key]])) as WebsiteYearSettings);
      } catch { /* Keep unsaved local choices when disconnected. */ }
    };
    const timer = setInterval(() => void refresh(), 5000);
    window.addEventListener("focus", refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  async function save(section: WebsiteSection) {
    writing.current = true;
    setBusy(section);
    setMessage("");
    try {
      const response = await fetch("/api/portal/tiger/website-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section, year: drafts[section] }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save.");
      setSaved(current => ({ ...current, [section]: drafts[section] }));
      dirty.current.delete(section);
      setMessage("Saved. This setting is live on the website and in Tiger settings.");
      onSaved?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save. Try again."); }
    finally { writing.current = false; setBusy(null); }
  }

  return <div className="space-y-4">
    <p className="text-sm text-ink-600">Choose each section&apos;s year independently. Automatic follows the existing season calendar. Saving takes effect immediately.</p>
    {!ready && <p role="alert" className="rounded border border-amber-500 bg-amber-50 p-3 text-sm">Website settings are unavailable. Install the website_section_settings.sql migration before saving.</p>}
    {WEBSITE_SECTIONS.filter(section => !onlySection || section.key === onlySection).map(section => <div key={section.key} className="rounded-lg border border-gold-300 bg-white p-4">
      <label htmlFor={"website-year-" + section.key} className="block font-semibold">{section.label}</label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select id={"website-year-" + section.key} value={drafts[section.key] ?? ""} disabled={busy !== null || !ready} onChange={event => {
          const value = event.target.value === "" ? null : Number(event.target.value);
          dirty.current.add(section.key);
          setDrafts(current => ({ ...current, [section.key]: value }));
          setMessage("");
        }} className="min-h-11 rounded border border-stone-300 bg-white px-3">
          <option value="">Automatic</option>
          {DISPLAY_YEARS.map(year => <option key={year} value={year}>{year}</option>)}
        </select>
        <button type="button" disabled={!ready || busy !== null || drafts[section.key] === saved[section.key]} onClick={() => void save(section.key)} className="min-h-11 rounded bg-maroon-700 px-4 py-2 text-white disabled:opacity-40">{busy === section.key ? "Saving…" : "Save"}</button>
      </div>
      <p className="mt-2 text-xs text-ink-500">Currently saved: {saved[section.key] ?? "Automatic"}</p>
    </div>)}
    <p role="status" aria-live="polite" className="text-sm">{message}</p>
  </div>;
}
