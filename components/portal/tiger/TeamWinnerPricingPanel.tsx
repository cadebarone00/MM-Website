"use client";

import { useState } from "react";

type Progress = { priced: number; remaining: number; failures: string[]; blockers: string[]; done: boolean; seasonYear: number; published: { maroon_win_probability: number | null; tie_probability: number | null; white_win_probability: number | null } | null };

const pct = (value: number | null | undefined) => (value == null ? "—" : `${(value * 100).toFixed(1)}%`);

/** Tiger's control for the Maroon vs White future. Pricing every possible
 * matchup takes a while, so it runs in chunks until nothing is left. Odds
 * then refresh on their own after every official score update. */
export function TeamWinnerPricingPanel() {
  const [running, setRunning] = useState(false);
  const [reset, setReset] = useState(false);
  const [pricedTotal, setPricedTotal] = useState(0);
  const [last, setLast] = useState<Progress | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setPricedTotal(0);
    setFailures([]);
    setLast(null);
    let first = true;
    try {
      for (;;) {
        const response = await fetch("/api/portal/tiger/team-winner/price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reset: first && reset }),
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error ?? "Pricing failed.");
        first = false;
        setPricedTotal((total) => total + data.priced);
        setFailures((current) => [...current, ...data.failures]);
        setLast(data);
        if (data.done || data.blockers.length) break;
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pricing failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-lg border-2 border-maroon-700 bg-cream-50 p-4 sm:p-6">
      <h2 className="font-serif text-xl font-bold text-ink-900">Team Winner — Maroon vs White</h2>
      <p className="mt-1 font-sans text-sm text-ink-600">
        Prices every matchup that could be posted in rounds without locked pairings, using the same match model as live odds, then publishes Maroon / Tie / White odds on the Wagers Futures tab. Run it once the rounds, formats, courses and rosters are set, and again if any of those change. After that, odds update on their own after every score. Bets pay out automatically when the last match is closed out.
      </p>
      <label className="mt-4 flex items-center gap-2 font-sans text-sm text-ink-700">
        <input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} disabled={running} />
        Reprice every matchup from scratch (use after Career Archive changes)
      </label>
      <button type="button" onClick={run} disabled={running} className="mt-4 rounded-lg bg-maroon-700 px-5 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50">
        {running ? "Pricing…" : "Price Team Winner"}
      </button>

      {(running || last) && (
        <p className="mt-3 font-sans text-sm text-ink-700">
          {pricedTotal} matchups priced{last && last.remaining > 0 ? `, ${last.remaining} to go…` : "."}
        </p>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 font-sans text-sm text-red-700">{error}</p>}
      {last?.blockers.length ? (
        <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 font-sans text-sm text-amber-900">
          <p className="m-0 font-semibold">Set these up first:</p>
          <ul className="m-0 mt-1 list-disc pl-5">{last.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
        </div>
      ) : null}
      {failures.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 font-sans text-sm text-amber-900">
          <p className="m-0 font-semibold">{failures.length} matchups couldn&apos;t be priced, so the market stays closed:</p>
          <ul className="m-0 mt-1 max-h-48 list-disc overflow-y-auto pl-5">{failures.map((failure) => <li key={failure}>{failure}</li>)}</ul>
        </div>
      )}
      {last?.done && last.published && !failures.length && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 font-sans text-sm font-semibold text-emerald-800">
          Published for {last.seasonYear}: Maroon {pct(last.published.maroon_win_probability)} · Tie {pct(last.published.tie_probability)} · White {pct(last.published.white_win_probability)}
        </p>
      )}
    </section>
  );
}
