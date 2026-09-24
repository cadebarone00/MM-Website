"use client";

import { useEffect, useState } from "react";

interface Standing {
  rank: number;
  rankLabel: string;
  displayName: string;
  total: number;
  isYou: boolean;
}

export function FantasyLeaderboard() {
  const [standings, setStandings] = useState<Standing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fantasy/leaderboard", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok) setStandings(data.standings);
        else setError(data.error ?? "Couldn't load the leaderboard.");
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't reach the server.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="mt-6 text-center font-sans text-sm text-score-under">{error}</p>;

  if (!standings) return <p className="mt-10 text-center font-sans text-sm text-ink-400">Loading leaderboard...</p>;

  if (standings.length === 0) {
    return <p className="mt-10 text-center font-sans text-sm text-ink-500">No one has drafted a fantasy team yet.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-ink-100">
      {standings.map((standing) => (
        <div
          key={`${standing.rank}-${standing.displayName}`}
          className={["flex items-center justify-between gap-3 py-3 first:pt-0", standing.isYou ? "bg-gold-200/20" : ""].join(" ")}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="w-9 shrink-0 text-center font-score text-sm font-bold tabular-nums text-ink-500">{standing.rankLabel}</span>
            <span className="min-w-0 truncate font-sans text-sm font-semibold text-ink-900">
              {standing.displayName}
              {standing.isYou && <span className="ml-1 font-condensed text-3xs font-bold uppercase text-maroon-700">(You)</span>}
            </span>
          </div>
          <span className="shrink-0 font-score text-base font-bold tabular-nums text-ink-900">{standing.total}</span>
        </div>
      ))}
    </div>
  );
}
