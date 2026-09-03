"use client";

import { useState } from "react";

export function CareerStatsImport({ databaseReady }: { databaseReady: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setSaving(true);
    setMessage(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch("/api/portal/tiger/career-stats/import", { method: "POST", body });
      const data = await response.json();
      if (!data.ok) { setMessage(data.error); return; }
      setMessage(`Imported ${data.individualHoles.toLocaleString()} individual holes, ${data.teamHoles.toLocaleString()} team holes, and ${data.matches} matches. Reloading…`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch {
      setMessage("The import could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border-2 border-maroon-700 bg-cream-50 p-4 sm:p-5">
      <h2 className="font-serif text-xl font-bold text-ink-900">Import Career Data & Odds Model</h2>
      <p className="mt-1 font-sans text-sm text-ink-600">Imports the validated individual, Fourball, Alternate Shot, and match layers while preserving every workbook sheet as an audit snapshot.</p>
      {!databaseReady && <p className="mt-3 font-sans text-sm font-semibold text-red-700">Run the updated Supabase schema before importing.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input type="file" accept=".xlsx" disabled={!databaseReady || saving} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="font-sans text-sm" />
        <button type="button" disabled={!file || !databaseReady || saving} onClick={upload} className="rounded-lg bg-maroon-700 px-5 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50">
          {saving ? "Importing…" : "Replace & Import"}
        </button>
      </div>
      {message && <p className="mt-3 font-sans text-sm text-ink-700">{message}</p>}
    </section>
  );
}
