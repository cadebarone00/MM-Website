"use client";

import { useEffect, useState } from "react";
import { formatAmericanOdds } from "@/lib/wagers/americanOdds";
import type { TotalBirdiesState } from "@/lib/wagers/totalBirdiesPricing";
import type { WagersMode } from "./WagersModeContext";
import { OddsButton } from "./OddsButton";

const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

/** Total Birdies — the whole field's birdies across every Singles and Fourball round, Over/Under. */
export function TotalBirdiesFutureCard({ mode }: { mode: WagersMode }) {
  const [state, setState] = useState<TotalBirdiesState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/wagers/total-birdies", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          if (data.ok) { setState(data); setFailed(false); } else setFailed(true);
        })
        .catch(() => active && setFailed(true));
    load();
    const timer = window.setInterval(load, 20_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const bettable = mode === "coins" && state?.status === "open";
  const sides = state?.line == null ? [] : [
    { key: `over:${state.line}`, name: `Over ${state.line}`, probability: state.over },
    { key: `under:${state.line}`, name: `Under ${state.line}`, probability: state.under },
  ];

  return (
    <div className="rounded-sm border border-gold-400 bg-white p-4">
      <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Event Future</p>
      <h3 className="m-0 mt-1 font-serif text-lg font-bold text-ink-900">Total Birdies</h3>
      <p className="m-0 mt-1 font-sans text-sm text-ink-500">
        Every birdie made by the whole field across every Singles and Fourball round, added together. Alternate Shot rounds don&rsquo;t count, and an eagle isn&rsquo;t a birdie.
      </p>

      {!state ? (
        <p className="mt-4 font-sans text-sm text-ink-400">{failed ? "Couldn't load Total Birdies odds." : "Loading odds…"}</p>
      ) : state.status === "not_ready" ? (
        <div className="mt-4 rounded-sm bg-cream-50 p-3">
          <p className="m-0 font-sans text-sm font-semibold text-ink-500">Odds post once the tournament is set up.</p>
          {state.blockers.length > 0 && (
            <ul className="m-0 mt-2 list-disc pl-5 font-sans text-2xs text-ink-400">
              {state.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <>
          <p className="m-0 mt-3 font-sans text-sm font-semibold text-ink-900">
            {state.status === "settled" && state.finalTotal !== null
              ? `Final total: ${state.finalTotal} birdies`
              : `${state.birdiesSoFar} birdies so far${state.expectedTotal !== null ? ` · projected ${state.expectedTotal.toFixed(1)}` : ""}`}
          </p>
          {sides.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {sides.map((side) => {
                const selection = state.market?.selections.find((s) => s.key === side.key);
                return (
                  <div key={side.key} className="flex flex-col items-center gap-1 rounded-sm bg-cream-50 px-2 py-3 text-center">
                    <span className="font-condensed text-xs font-bold uppercase tracking-wide text-ink-900">{side.name}</span>
                    <span className="font-sans text-2xs text-ink-400">{percent(side.probability)}</span>
                    {selection && bettable ? (
                      <OddsButton marketKey={state.marketKey} selectionKey={selection.key} label={selection.label} odds={selection.odds} />
                    ) : (
                      <span className="py-2 font-condensed text-sm font-bold tabular-nums text-ink-500">{selection ? formatAmericanOdds(selection.odds) : "—"}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="m-0 mt-3 font-sans text-2xs text-ink-400">
            {state.status === "settled"
              ? "Every bet was graded against the line it was placed at. Wagers have been paid out."
              : state.status === "complete"
                ? "Every hole is in — betting is closed. Pays out once Tiger closes out the last match."
                : state.status === "updating"
                  ? "Updating the line after the latest score…"
                  : mode === "real"
                    ? "Real Wagers is coming soon — switch to MM Coins to bet on this now."
                    : "The line is the half-birdie total nearest 50/50 from 10,000 simulations of every remaining hole, using each player's Career Archive birdie rate on that hole's par and yardage. It moves as birdies are made; your bet keeps the line you took."}
          </p>
        </>
      )}
    </div>
  );
}
