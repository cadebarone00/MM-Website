"use client";

import { useEffect, useState } from "react";
import type { TestSeasonMatchStatus } from "@/lib/live/testSeasonStatus";

const OFFICIAL = new Set(["submitted", "final"]);

/** Live view of what the 2034 test matches are doing behind the scenes — the way to check the Submit Round flow when nothing is really being played. */
export function TestSeasonStatus() {
  const [matches, setMatches] = useState<TestSeasonMatchStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/portal/tiger/test-season/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => { if (cancelled) return; if (data.ok) { setMatches(data.matches); setError(null); } else setError(data.error ?? "Could not load the rehearsal status."); })
      .catch(() => { if (!cancelled) setError("Could not load the rehearsal status."); });
    void load();
    const timer = window.setInterval(load, 10000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  return (
    <div className="mt-5 border-t border-amber-300 pt-4">
      <h3 className="font-condensed text-xs font-bold uppercase tracking-[0.16em] text-ink-700">Rehearsal status</h3>
      {error && <p className="mt-2 font-sans text-sm text-red-700">{error}</p>}
      {matches && matches.length === 0 && <p className="mt-2 font-sans text-sm text-ink-600">No test matches yet — set up 2034 matchups in Open Test Setup, then Start the round.</p>}
      <div className="mt-2 space-y-3">
        {(matches ?? []).map((match) => (
          <div key={match.id} className="rounded-md bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-sans text-sm font-semibold text-ink-900">{match.label}</p>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-condensed text-2xs font-bold uppercase tracking-wide text-amber-900">{match.matchStatus}</span>
            </div>
            <p className="mt-1 font-sans text-xs text-maroon-800">{match.hint}</p>
            <ul className="mt-2 space-y-1">
              {match.players.map((player) => (
                <li key={player.slug} className="font-sans text-xs text-ink-700">
                  <span className="font-semibold">{player.name}</span> — {player.holesConfirmed}/18 holes matched · {player.submitted ? "submitted ✓" : "not submitted"} · {player.archiveStatus && OFFICIAL.has(player.archiveStatus) ? "official record ✓" : "not official yet"} · handicap: {player.countsForHandicap ? "would count ✓" : "not counted"}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-2 font-sans text-xs text-ink-500">Test rounds never change a real handicap or real stats; &quot;would count&quot; shows what a real round would do. Updates every 10 seconds.</p>
    </div>
  );
}
