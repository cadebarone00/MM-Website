"use client";

import { useEffect, useState } from "react";
import { formatAmericanOdds } from "@/lib/wagers/americanOdds";
import type { PlayerBirdiesRow, PlayerBirdiesState } from "@/lib/wagers/playerBirdiesPricing";
import type { WagersMode } from "./WagersModeContext";
import { OddsButton } from "./OddsButton";
import { AssumptionsNote } from "./AssumptionsNote";

/** One player's line: name, an alternate-line slider, and Over / Under odds for the chosen line. */
function PlayerLine({
  entry,
  chosenLine,
  onChoose,
  state,
  bettable,
}: {
  entry: PlayerBirdiesRow;
  chosenLine: number | undefined;
  onChoose: (line: number) => void;
  state: PlayerBirdiesState;
  bettable: boolean;
}) {
  const found = chosenLine === undefined ? -1 : entry.lines.findIndex((line) => line.line === chosenLine);
  const index = found >= 0 ? found : entry.featured;
  const line = entry.lines[index];
  if (!line) return null;

  const side = (key: "over" | "under", name: string, odds: number | null) => {
    const selection = state.market?.selections.find((s) => s.key === `${entry.player}:${key}:${line.line}` /* same as playerBirdieSelectionKey */);
    return selection && bettable ? (
      <OddsButton marketKey={state.marketKey} selectionKey={selection.key} label={selection.label} odds={selection.odds} prefix={name} />
    ) : (
      <span className="inline-block min-w-[64px] rounded-sm border border-ink-100 px-3 py-2 text-center font-condensed text-sm font-bold tabular-nums text-ink-500">
        {name} {odds !== null ? formatAmericanOdds(odds) : "—"}
      </span>
    );
  };

  return (
    <div className="grid grid-cols-1 items-center gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] sm:gap-4">
      <div className="min-w-0">
        <p className="m-0 truncate font-sans text-sm font-semibold text-ink-900">{entry.name}</p>
        <p className="m-0 font-sans text-2xs text-ink-400">
          {entry.birdiesSoFar} so far · projected {entry.expected.toFixed(1)}
        </p>
      </div>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="font-condensed text-xs font-bold uppercase tracking-wide text-ink-700">
          {line.line} birdies
        </span>
        <input
          type="range"
          min={0}
          max={entry.lines.length - 1}
          step={1}
          value={index}
          onChange={(event) => onChoose(entry.lines[Number(event.target.value)].line)}
          aria-label={`${entry.name} birdie line`}
          className="w-full accent-maroon-700"
        />
      </label>
      <div className="flex gap-2">
        {side("over", "Over", line.overOdds)}
        {side("under", "Under", line.underOdds)}
      </div>
    </div>
  );
}

/** Player Birdies — each player's own birdies across every Singles and Fourball round, with alternate lines. */
export function PlayerBirdiesFutureCard({ mode }: { mode: WagersMode }) {
  const [state, setState] = useState<PlayerBirdiesState | null>(null);
  const [failed, setFailed] = useState(false);
  // Remembered by line value, not slider position, so a refresh that shifts
  // the available lines doesn't move someone's chosen line.
  const [chosen, setChosen] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/wagers/player-birdies", { cache: "no-store" })
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
      <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Player Future</p>
      <h3 className="m-0 mt-1 font-serif text-lg font-bold text-ink-900">Player Birdies</h3>
      <p className="m-0 mt-1 font-sans text-sm text-ink-500">
        Each player&rsquo;s birdies across every Singles and Fourball round. Slide to pick a line, then take the Over or the Under. Alternate Shot doesn&rsquo;t count, and an eagle isn&rsquo;t a birdie.
      </p>

      {!state ? (
        <p className="mt-4 font-sans text-sm text-ink-400">{failed ? "Couldn't load Player Birdies odds." : "Loading odds…"}</p>
      ) : state.status === "not_ready" || !state.players.length ? (
        state.finalBirdies && state.status === "settled" ? (
          <p className="mt-4 font-sans text-sm text-ink-500">Every bet was graded against the line it was placed at. Wagers have been paid out.</p>
        ) : (
          <div className="mt-4 rounded-sm bg-cream-50 p-3">
            <p className="m-0 font-sans text-sm font-semibold text-ink-500">
              {state.status === "complete" ? "Every hole is in — betting is closed. Pays out once Tiger closes out the last match." : "Odds post once the tournament is set up."}
            </p>
            {state.status === "not_ready" && state.blockers.length > 0 && (
              <ul className="m-0 mt-2 list-disc pl-5 font-sans text-2xs text-ink-400">
                {state.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              </ul>
            )}
          </div>
        )
      ) : (
        <>
          <div className="mt-4 divide-y divide-gold-200">
            {state.players.map((entry) => (
              <PlayerLine
                key={entry.player}
                entry={entry}
                chosenLine={chosen[entry.player]}
                onChoose={(line) => setChosen((current) => ({ ...current, [entry.player]: line }))}
                state={state}
                bettable={bettable}
              />
            ))}
          </div>
          <p className="m-0 mt-3 font-sans text-2xs text-ink-400">
            {state.status === "updating"
              ? "Updating lines after the latest score…"
              : mode === "real"
                ? "Real Wagers is coming soon — switch to MM Coins to bet on this now."
                : "Each slider starts on the line nearest 50/50. Odds come from 10,000 simulations of every remaining hole using that player's Career Archive birdie rate on each hole's par and yardage. Your bet keeps the line you took."}
          </p>
        </>
      )}
      {state && <AssumptionsNote assumptions={state.assumptions} />}
    </div>
  );
}
