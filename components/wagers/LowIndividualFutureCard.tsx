"use client";

import { useEffect, useState } from "react";
import { formatAmericanOdds } from "@/lib/wagers/americanOdds";
import type { LowIndividualState } from "@/lib/wagers/lowIndividualPricing";
import type { WagersMode } from "./WagersModeContext";
import { OddsButton } from "./OddsButton";
import { AssumptionsNote } from "./AssumptionsNote";

const percent = (value: number) => (value > 0 && value < 0.005 ? "<1%" : `${Math.round(value * 100)}%`);
const toPar = (value: number) => (value === 0 ? "E" : value > 0 ? `+${value}` : String(value));

/** Low Individual — fewest total strokes across every Singles and Fourball round. */
export function LowIndividualFutureCard({ mode }: { mode: WagersMode }) {
  const [state, setState] = useState<LowIndividualState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/wagers/low-individual", { cache: "no-store" })
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
  const winnerNames = state?.entries.filter((entry) => state.winners.includes(entry.player)).map((entry) => entry.name) ?? [];

  return (
    <div className="rounded-sm border border-gold-400 bg-white p-4">
      <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Player Future</p>
      <h3 className="m-0 mt-1 font-serif text-lg font-bold text-ink-900">Low Individual</h3>
      <p className="m-0 mt-1 font-sans text-sm text-ink-500">
        Fewest total strokes across every Singles and Fourball round. Alternate Shot rounds don&rsquo;t count. Ties for 1st are paid dead heat: the payout is split by the number of players tied.
      </p>

      {!state ? (
        <p className="mt-4 font-sans text-sm text-ink-400">{failed ? "Couldn't load Low Individual odds." : "Loading odds…"}</p>
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
          <div className="mt-4 divide-y divide-gold-200">
            {state.entries.map((entry) => {
              const selection = state.market?.selections.find((s) => s.key === entry.player);
              return (
                <div key={entry.player} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="m-0 truncate font-sans text-sm font-semibold text-ink-900">{entry.name}</p>
                    <p className="m-0 font-sans text-2xs text-ink-400">
                      {percent(entry.probability)} to win
                      {state.started && ` · ${toPar(entry.toPar)} (${entry.strokes}) thru ${entry.holesPlayed}/${entry.holesTotal}`}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {selection && bettable ? (
                      <OddsButton marketKey={state.marketKey} selectionKey={selection.key} label={selection.label} odds={selection.odds} />
                    ) : (
                      <span className="font-condensed text-sm font-bold tabular-nums text-ink-500">{entry.odds !== null ? formatAmericanOdds(entry.odds) : "—"}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="m-0 mt-3 font-sans text-2xs text-ink-400">
            {state.status === "settled"
              ? `Final: ${winnerNames.join(" & ") || "settled"}${winnerNames.length > 1 ? " tied (dead heat)" : " won"}. Wagers have been paid out.`
              : state.status === "complete"
                ? "Every hole is in — betting is closed. Pays out once Tiger closes out the last match."
                : state.status === "updating"
                  ? "Updating odds after the latest score…"
                  : mode === "real"
                    ? "Real Wagers is coming soon — switch to MM Coins to bet on this now."
                    : "Odds from 10,000 simulations of every remaining hole, using each player's Career Archive scoring on that hole's par and yardage."}
          </p>
        </>
      )}
      {state && <AssumptionsNote assumptions={state.assumptions} />}
    </div>
  );
}
