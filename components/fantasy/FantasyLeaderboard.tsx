"use client";

import { useEffect, useState } from "react";

interface Standing {
  rank: number;
  rankLabel: string;
  teamName: string;
  displayName: string;
  total: number;
  isYou: boolean;
}

/** Sample rows shown until anyone has actually drafted a team - never mixed with real ones, and replaced the moment `standings` comes back non-empty. */
const MOCK_STANDINGS: Standing[] = [
  { rank: 1, rankLabel: "1", teamName: "The Sunday Reds", displayName: "J. Alvarez", total: 214, isYou: false },
  { rank: 2, rankLabel: "2", teamName: "Bogey Free Zone", displayName: "M. Chen", total: 208, isYou: false },
  { rank: 3, rankLabel: "3", teamName: "Handicap Heroes", displayName: "R. Delgado", total: 201, isYou: false },
  { rank: 4, rankLabel: "4", teamName: "Fairways & Friends", displayName: "S. Whitfield", total: 197, isYou: false },
  { rank: 5, rankLabel: "T5", teamName: "Eagle Eyed", displayName: "T. Brooks", total: 190, isYou: false },
  { rank: 5, rankLabel: "T5", teamName: "The Mulligans", displayName: "K. Patel", total: 190, isYou: false },
  { rank: 7, rankLabel: "7", teamName: "Gimme That Trophy", displayName: "L. Novak", total: 183, isYou: false },
  { rank: 8, rankLabel: "8", teamName: "Sand Trap Squad", displayName: "D. Ferreira", total: 176, isYou: false },
  { rank: 9, rankLabel: "9", teamName: "Three Putt Crew", displayName: "A. Kowalski", total: 168, isYou: false },
  { rank: 10, rankLabel: "10", teamName: "Rough Riders", displayName: "P. Osei", total: 159, isYou: false },
];

function StandingRow({ standing }: { standing: Standing }) {
  return (
    <div
      className={["flex items-center justify-between gap-3 py-3 first:pt-0", standing.isYou ? "bg-gold-200/20" : ""].join(" ")}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-9 shrink-0 text-center font-score text-sm font-bold tabular-nums text-ink-500">{standing.rankLabel}</span>
        <span className="min-w-0">
          <span className="block truncate font-sans text-sm font-semibold text-ink-900">
            {standing.teamName}
            {standing.isYou && <span className="ml-1 font-condensed text-3xs font-bold uppercase text-maroon-700">(You)</span>}
          </span>
          <span className="block truncate font-sans text-xs text-ink-400">{standing.displayName}</span>
        </span>
      </div>
      <span className="shrink-0 font-score text-base font-bold tabular-nums text-ink-900">{standing.total}</span>
    </div>
  );
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
    return (
      <div>
        <p className="mb-2 text-center font-condensed text-2xs font-bold uppercase tracking-wide text-ink-400">
          Sample leaderboard — draft your team to see real rankings
        </p>
        <div className="flex flex-col divide-y divide-ink-100 opacity-70">
          {MOCK_STANDINGS.map((standing) => (
            <StandingRow key={`${standing.rank}-${standing.teamName}`} standing={standing} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-ink-100">
      {standings.map((standing) => (
        <StandingRow key={`${standing.rank}-${standing.displayName}`} standing={standing} />
      ))}
    </div>
  );
}
