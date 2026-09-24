"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPlayerDisplayName } from "@/lib/data/players";
import { liveMatchMarket, type LiveOddsSnapshot } from "@/lib/wagers/liveMatchMarket";
import { OddsButton } from "@/components/wagers/OddsButton";

type Entry = {
  match: { id: string; round: number; box_number: number; format: string; maroon_players: string[]; white_players: string[] };
  officialState: { status: string; thru: number; leader: string; margin: number } | null;
  odds: LiveOddsSnapshot | null;
};

function names(players: string[]) { return players.map(getPlayerDisplayName).join(" & "); }

/** Wagers' live-season match market list. It reads saved snapshots instead
 * of reproducing probability logic in the browser. */
export function LiveMatchesList() {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/live/matches", { cache: "no-store" }).then((res) => res.json()).then((data) => active && setEntries(data.ok ? data.matches : [])).catch(() => active && setEntries([]));
    load();
    const timer = window.setInterval(load, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  if (entries === null) return <p className="font-sans text-sm text-ink-400">Loading live match markets…</p>;
  if (entries.length === 0) return <p className="font-sans text-sm text-ink-400">No live-season matches have been published yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      {entries.map(({ match, officialState, odds }) => {
        const market = odds ? liveMatchMarket(match, odds) : null;
        const state = officialState?.status === "live" ? `LIVE · THRU ${officialState.thru || "—"}` : officialState?.status === "complete" ? "Awaiting closeout" : "Upcoming";
        return (
          <div key={match.id} className="rounded-md border border-ink-100 bg-white p-4">
            <Link href={`/api/live/matches/${match.id}`} className="font-sans text-sm font-semibold text-ink-900 hover:text-maroon-700">
              {names(match.maroon_players)} vs {names(match.white_players)}
            </Link>
            <p className="mt-1 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Round {match.round} · {match.format} · {state}</p>
            {market ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {market.selections.map((selection) => (
                  <div key={selection.key} className="rounded-sm bg-cream-50 px-2 py-2 text-center">
                    <p className="font-condensed text-2xs font-bold uppercase text-ink-500">{selection.key}</p>
                    <OddsButton marketKey={market.marketKey} selectionKey={selection.key} label={selection.label} odds={selection.odds} />
                  </div>
                ))}
              </div>
            ) : <p className="mt-3 font-sans text-sm text-ink-400">Pricing is being prepared.</p>}
          </div>
        );
      })}
    </div>
  );
}
