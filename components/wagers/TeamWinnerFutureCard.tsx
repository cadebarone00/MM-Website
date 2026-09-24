"use client";

import { useEffect, useState } from "react";
import { formatAmericanOdds } from "@/lib/wagers/americanOdds";
import type { TeamWinnerState } from "@/lib/wagers/teamWinnerPricing";
import type { WagersMode } from "./WagersModeContext";
import { OddsButton } from "./OddsButton";

const SIDES = [
  { key: "maroon", name: "Maroon", accent: "text-maroon-700" },
  { key: "tie", name: "Tie", accent: "text-ink-500" },
  { key: "white", name: "White", accent: "text-ink-900" },
] as const;

const RESULT_TEXT = { maroon: "Maroon", white: "White", tie: "A tie" } as const;

const percent = (value: number) => (value > 0 && value < 0.005 ? "<1%" : `${Math.round(value * 100)}%`);

/** Maroon vs White — which team finishes the whole event with more points. */
export function TeamWinnerFutureCard({ mode }: { mode: WagersMode }) {
  const [state, setState] = useState<TeamWinnerState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/wagers/team-winner", { cache: "no-store" })
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
  const points = state?.points;
  const played = points && points.maroon + points.white > 0;

  return (
    <div className="rounded-sm border border-gold-400 bg-white p-4">
      <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Team Winner</p>
      <h3 className="m-0 mt-1 font-serif text-lg font-bold text-ink-900">Maroon vs White</h3>
      <p className="m-0 mt-1 font-sans text-sm text-ink-500">
        Which team finishes {state ? `the ${state.seasonYear} event` : "the event"} with more points. Every match is worth 1 point; a halved match is ½ each.
      </p>

      {played && (
        <p className="m-0 mt-3 font-sans text-sm font-semibold text-ink-900">
          Maroon {points.maroon} · White {points.white}
          <span className="font-normal text-ink-400"> · {points.remaining} left to play</span>
        </p>
      )}

      {!state ? (
        <p className="mt-4 font-sans text-sm text-ink-400">{failed ? "Couldn't load Team Winner odds." : "Loading odds…"}</p>
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
          <div className="mt-4 grid grid-cols-3 gap-2">
            {SIDES.map((side) => {
              const selection = state.market?.selections.find((s) => s.key === side.key);
              const probability = state.probabilities?.[side.key] ?? 0;
              return (
                <div key={side.key} className="flex flex-col items-center gap-1 rounded-sm bg-cream-50 px-2 py-3 text-center">
                  <span className={`font-condensed text-xs font-bold uppercase tracking-wide ${side.accent}`}>{side.name}</span>
                  <span className="font-sans text-2xs text-ink-400">{percent(probability)}</span>
                  {selection && bettable ? (
                    <OddsButton marketKey={state.market!.marketKey} selectionKey={selection.key} label={selection.label} odds={selection.odds} />
                  ) : (
                    <span className="py-2 font-condensed text-sm font-bold tabular-nums text-ink-500">{selection ? formatAmericanOdds(selection.odds) : "—"}</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="m-0 mt-3 font-sans text-2xs text-ink-400">
            {state.status === "settled"
              ? `Final: ${state.result === "tie" || !state.result ? "the event ended tied" : `${RESULT_TEXT[state.result]} won`}. Wagers have been paid out.`
              : state.status === "decided"
                ? `Betting closed — ${state.result === "tie" ? "the event is locked in as a tie" : `${RESULT_TEXT[state.result ?? "tie"]} can't be caught`}. Pays out when the last match is closed out.`
                : state.status === "updating"
                  ? "Updating odds after the latest score…"
                  : mode === "real"
                    ? "Real Wagers is coming soon — switch to MM Coins to bet on this now."
                    : "Odds from 10,000 simulations of the rest of the event, using every player's Career Archive history."}
          </p>
        </>
      )}
    </div>
  );
}
