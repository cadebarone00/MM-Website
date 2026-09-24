"use client";

import { useEffect, useState } from "react";
import { getPlayerDisplayName } from "@/lib/data/players";

type Entry = { match: { id: string; round: number; box_number: number; maroon_players: string[]; white_players: string[] }; officialState: { status: string; leader: string; margin: number } | null; submittedPlayers: string[] };

export function MatchCloseoutCards() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => fetch("/api/live/matches", { cache: "no-store" }).then((res) => res.json()).then((data) => { if (data.ok) setEntries(data.matches); }).catch(() => undefined);
  useEffect(() => { void load(); const timer = window.setInterval(load, 15000); return () => window.clearInterval(timer); }, []);
  async function closeMatch(id: string) {
    setBusy(id); setError(null);
    try {
      const res = await fetch("/api/portal/tiger/matchboxes/closeout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      if (!data.ok) setError(data.error);
      await load();
    } catch { setError("Connection interrupted. Retry Close Out Match; a completed settlement will not be paid twice."); }
    finally { setBusy(null); }
  }
  const ready = entries.filter((entry) => entry.officialState?.status === "complete");
  if (ready.length === 0) return null;
  return <section className="mt-6 rounded-lg border-2 border-maroon-700 bg-maroon-50 p-4"><h2 className="font-serif text-xl font-bold text-ink-900">Match Closeout</h2>{error && <p className="mt-2 font-sans text-sm text-red-700">{error}</p>}<div className="mt-3 space-y-3">{ready.map(({ match, officialState, submittedPlayers }) => {
  const waiting = [...match.maroon_players, ...match.white_players].filter((slug) => !submittedPlayers.includes(slug));
  return (
    <div key={match.id} className="flex flex-wrap items-center justify-between gap-3 rounded bg-white p-3">
      <div>
        <p className="font-sans text-sm font-semibold text-ink-900">Round {match.round}, Match {match.box_number}: {officialState?.leader === "tie" ? "Tied" : `${officialState?.leader} ${officialState?.margin} up`}</p>
        {waiting.length > 0 && <p className="font-sans text-xs text-ink-500">Waiting on {waiting.map(getPlayerDisplayName).join(", ")} to submit their round</p>}
      </div>
      <button type="button" disabled={busy === match.id || waiting.length > 0} onClick={() => closeMatch(match.id)} className="rounded bg-maroon-700 px-3 py-2 font-condensed text-2xs font-bold uppercase text-white disabled:bg-ink-200 disabled:text-ink-500">{busy === match.id ? "Closing…" : "Close Out Match"}</button>
      {waiting.length > 0 && <button type="button" disabled={busy === match.id} onClick={() => closeMatch(match.id)} className="font-condensed text-2xs font-bold uppercase text-maroon-700 underline">Close out anyway</button>}
    </div>
  );
})}</div></section>;
}
