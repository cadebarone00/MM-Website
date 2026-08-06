"use client";

import { useEffect, useState } from "react";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { listAllMarkets } from "@/lib/wagers/marketKeys";
import { formatAmericanOdds } from "@/lib/wagers/americanOdds";

export function MMCoinsSettlementAdmin() {
  const { tournament, loading } = useLiveTournament();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settledKeys, setSettledKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/wagers/mm-coins/settled-markets", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setSettledKeys(new Set(data.settlements.map((s: { marketKey: string }) => s.marketKey)));
        }
      });
  }, []);

  if (loading) return <p className="p-8 font-sans text-sm text-ink-400">Loading markets…</p>;

  const markets = listAllMarkets(tournament);

  async function settle(marketKey: string, winningSelectionKey: string) {
    setBusyKey(marketKey);
    setError(null);
    try {
      const res = await fetch("/api/wagers/mm-coins/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketKey, winningSelectionKey }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setSettledKeys((current) => new Set(current).add(marketKey));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">MM Coins Settlement</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">
        Pick the winning side for each market below. This resolves every pending MM Coins wager on it — this cannot be undone.
      </p>
      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex flex-col gap-4">
        {markets.map((market) => {
          const isSettled = settledKeys.has(market.marketKey);
          return (
            <div key={market.marketKey} className="rounded-md border border-ink-100 bg-white p-4">
              <p className="m-0 font-sans text-sm font-semibold text-ink-900">
                {market.groupLabel}
                {market.day != null ? ` — Day ${market.day}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {market.selections.map((selection) => (
                  <button
                    key={selection.key}
                    type="button"
                    disabled={isSettled || busyKey === market.marketKey}
                    onClick={() => settle(market.marketKey, selection.key)}
                    className="rounded-sm border border-ink-300 px-3 py-2 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-700 hover:bg-cream-50 disabled:opacity-40"
                  >
                    {selection.label} ({formatAmericanOdds(selection.odds)})
                  </button>
                ))}
              </div>
              {isSettled && <p className="mt-2 font-sans text-2xs text-fairway-700">Settled ✓</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
