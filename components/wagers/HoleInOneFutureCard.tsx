"use client";

import { useEffect, useState } from "react";
import { formatAmericanOdds } from "@/lib/wagers/americanOdds";
import type { HoleInOneState } from "@/lib/wagers/holeInOnePricing";
import type { WagersMode } from "./WagersModeContext";
import { OddsButton } from "./OddsButton";

const SIDES = [
  { key: "yes", name: "Yes" },
  { key: "no", name: "No" },
] as const;

const percent = (value: number) => (value > 0 && value < 0.001 ? "<0.1%" : `${(value * 100).toFixed(1)}%`);

/** Hole in One — will anyone ace a hole during the event? */
export function HoleInOneFutureCard({ mode }: { mode: WagersMode }) {
  const [state, setState] = useState<HoleInOneState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/wagers/hole-in-one", { cache: "no-store" })
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

  return (
    <div className="rounded-sm border border-gold-400 bg-white p-4">
      <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Event Future</p>
      <h3 className="m-0 mt-1 font-serif text-lg font-bold text-ink-900">Hole in One</h3>
      <p className="m-0 mt-1 font-sans text-sm text-ink-500">
        Will anyone make a hole in one during {state ? `the ${state.seasonYear} event` : "the event"}? Any round, any format.
      </p>

      {!state ? (
        <p className="mt-4 font-sans text-sm text-ink-400">{failed ? "Couldn't load Hole in One odds." : "Loading odds…"}</p>
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
          {state.aces.length > 0 && (
            <p className="m-0 mt-3 rounded-sm bg-fairway-600 px-3 py-2 font-sans text-sm font-semibold text-white">
              {state.aces.map((ace) => `${ace.name} aced Round ${ace.round}, hole ${ace.hole}!`).join(" ")}
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {SIDES.map((side) => {
              const selection = state.market?.selections.find((s) => s.key === side.key);
              const probability = state.probability === null ? 0 : side.key === "yes" ? state.probability : 1 - state.probability;
              return (
                <div key={side.key} className="flex flex-col items-center gap-1 rounded-sm bg-cream-50 px-2 py-3 text-center">
                  <span className="font-condensed text-xs font-bold uppercase tracking-wide text-ink-900">{side.name}</span>
                  <span className="font-sans text-2xs text-ink-400">{percent(probability)}</span>
                  {selection && bettable ? (
                    <OddsButton marketKey={state.marketKey} selectionKey={selection.key} label={selection.label} odds={selection.odds} />
                  ) : (
                    <span className="py-2 font-condensed text-sm font-bold tabular-nums text-ink-500">{selection ? formatAmericanOdds(selection.odds) : "—"}</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="m-0 mt-3 font-sans text-2xs text-ink-400">
            {state.status === "settled"
              ? `Final: ${state.result === "yes" ? "Yes — there was a hole in one" : "No hole in one"}. Wagers have been paid out.`
              : state.status === "ace"
                ? "Betting is closed — Yes is locked in. Pays out when the last match is closed out."
                : state.status === "closed"
                  ? "Every par 3 has been played — betting is closed. Pays out when the last match is closed out."
                  : mode === "real"
                    ? "Real Wagers is coming soon — switch to MM Coins to bet on this now."
                    : `${state.teeShotsRemaining.toLocaleString()} par-3 tee shots left, at a low-handicap ace rate of 1 in ${Math.round(1 / state.perShot).toLocaleString()} per tee shot. There's no hole in one in the Career Archive to base a player-specific rate on.`}
          </p>
        </>
      )}
    </div>
  );
}
