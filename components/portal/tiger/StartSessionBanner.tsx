"use client";

import { useState } from "react";

export interface StartableSession {
  year: number;
  session: number;
  format: string;
  courseName: string | null;
  date: string | null;
}

export function StartSessionBanner({ session }: { session: StartableSession }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: session.year, session: session.session }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border-2 border-maroon-700 bg-maroon-50 p-4">
      <span className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700">Ready to start</span>
      <div className="mt-1 font-serif text-xl font-bold text-ink-900">
        Session {session.session} — {session.courseName ?? "Course TBD"} ({session.format})
      </div>
      {session.date && <div className="mt-1 font-sans text-sm text-ink-500">{session.date}</div>}
      {error && <p className="mt-2 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={start}
        className="mt-3 rounded-lg bg-maroon-700 px-4 py-2 font-condensed text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
      >
        {busy ? "Starting…" : "Start Session"}
      </button>
    </div>
  );
}
