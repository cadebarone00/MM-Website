"use client";

import { useEffect, useState } from "react";

interface StandingRow {
  profileId: string;
  displayName: string;
  balance: number;
}

/** Every participant's MM Coins balance, ranked highest first — the tournament's last market closing crowns whoever's on top the MM Coins Champion. */
export function MMCoinsLeaderboard() {
  const [standings, setStandings] = useState<StandingRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/wagers/mm-coins/leaderboard", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.ok) setStandings(data.standings);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!standings) return <p className="font-sans text-sm text-ink-400">Loading standings…</p>;
  if (standings.length === 0) return <p className="font-sans text-sm text-ink-400">No one&rsquo;s placed a wager yet.</p>;

  return (
    <div className="rounded-md border border-ink-100 bg-white">
      {standings.map((row, i) => (
        <div
          key={row.profileId}
          className={["flex items-center justify-between gap-3 px-4 py-3", i > 0 ? "border-t border-ink-100" : ""].join(" ")}
        >
          <span className="font-sans text-sm font-semibold text-ink-900">
            {i === 0 && "🏆 "}
            {row.displayName}
          </span>
          <span className="font-sans text-sm font-black text-maroon-700 tabular-nums">{row.balance.toLocaleString()} pts</span>
        </div>
      ))}
    </div>
  );
}
