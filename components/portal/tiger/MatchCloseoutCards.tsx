"use client";

import { useEffect, useState } from "react";

type Entry = { match: { id: string; round: number; box_number: number; maroon_players: string[]; white_players: string[] }; officialState: { status: string; leader: string; margin: number } | null };

export function MatchCloseoutCards() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => fetch("/api/live/matches", { cache: "no-store" }).then((res) => res.json()).then((data) => setEntries(data.ok ? data.matches : []));
  useEffect(() => { load(); }, []);
  const ready = entries.filter((entry) => entry.officialState?.status === "complete");
  if (ready.length === 0) return null;
  return <section className="mt-6 rounded-lg border-2 border-maroon-700 bg-maroon-50 p-4"><h2 className="font-serif text-xl font-bold text-ink-900">Match Closeout</h2>{error && <p className="mt-2 font-sans text-sm text-red-700">{error}</p>}<div className="mt-3 space-y-3">{ready.map(({ match, officialState }) => <div key={match.id} className="flex flex-wrap items-center justify-between gap-3 rounded bg-white p-3"><p className="font-sans text-sm font-semibold text-ink-900">Round {match.round}, Match {match.box_number}: {officialState?.leader === "tie" ? "Tied" : `${officialState?.leader} ${officialState?.margin} up`}</p><button type="button" disabled={busy === match.id} onClick={async () => { setBusy(match.id); setError(null); const res = await fetch("/api/portal/tiger/matchboxes/closeout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: match.id }) }); const data = await res.json(); if (!data.ok) setError(data.error); await load(); setBusy(null); }} className="rounded bg-maroon-700 px-3 py-2 font-condensed text-2xs font-bold uppercase text-white disabled:opacity-50">{busy === match.id ? "Closing…" : "Close Out Match"}</button></div>)}</div></section>;
}
