"use client";

import { useState } from "react";
import { DEFAULT_SCORING, editGameSettings, initialGameSettings, ninePointWarnings, startGameSettings, type ScoringGameId, type ScoringSettings } from "@/lib/platform/game-engine";
import { GAME_PREVIEW_PLAYERS } from "@/lib/platform/golfTripGames";
import { GolfGameScoringPreview } from "./GolfGameScoringPreview";
import styles from "./GolfTripSettingsPreview.module.css";

const LABELS: Record<string, string> = {
  holeWin: "Hole win points", holeTie: "Hole tie points", matchWin: "Round / match win bonus", matchTie: "Match tie points", handicap: "Handicap", playoff: "Playoff",
  partnerWin: "Partner-team win points", loneWin: "Lone Wolf win points", loneLoss: "Lone Wolf loss points", tie: "Tie points", loneMultiplier: "Lone Wolf multiplier", blindEnabled: "Blind Wolf enabled", blindWin: "Blind Wolf win points", birdieBonus: "Birdie bonus", eagleBonus: "Eagle bonus", carryover: "Carryover ties",
  multiplier: "Points per score difference", capEnabled: "Max points per hole enabled", cap: "Max points per hole", birdieFlip: "Birdie flip", eagleFlip: "Eagle flip", negativePoints: "Negative points allowed",
  segmentWin: "Segment win bonus", segmentTie: "Segment tie points", roundBonus: "Overall round bonus", opponentPoints: "Points per opponent defeated", soloMultiplier: "Solo win multiplier", noSplit: "No-split / all-same behavior", skinValue: "Points per skin",
};
function labelFor(key: string): string {
  const allocation = /^(different|lowTie|highTie|allTie)([123])$/.exec(key);
  if (allocation) return `${({ different: "Different scores", lowTie: "Tie low", highTie: "Tie high", allTie: "All tie" } as Record<string, string>)[allocation[1]]} · ${["Low", "Middle", "High"][Number(allocation[2]) - 1]}`;
  return LABELS[key] ?? key;
}

/** Local state only, deliberately independent of Competition and persistence. */
export function GolfGameScoringSettings({ game }: { game: ScoringGameId }) {
  const [state, setState] = useState(() => initialGameSettings(game));
  const locked = state.status === "started";
  const config = state.scoring.values;
  const change = (key: string, value: number | boolean | string) => setState(current => editGameSettings(current, "custom", { ...current.scoring, values: { ...current.scoring.values, [key]: value } } as ScoringSettings));
  const count = game === "9-point" ? 3 : game === "match-play" ? 2 : 4;
  const warnings = state.scoring.game === "9-point" ? ninePointWarnings(state.scoring.values) : [];

  return <>
    <fieldset className={styles.scoringFields} disabled={locked} aria-label={`${game} scoring settings`}>
      <div className={styles.compactOptions}>
        {(["standard", "custom"] as const).map(preset => <button key={preset} type="button" aria-pressed={state.preset === preset} className={`${styles.compactOption} ${state.preset === preset ? styles.compactOptionActive : ""}`} onClick={() => setState(current => editGameSettings(current, preset))}>{preset === "standard" ? "Standard preset" : "Custom preset"}</button>)}
        <button type="button" className={styles.compactOption} onClick={() => setState(current => editGameSettings(current, "standard"))}>Reset to Standard</button>
      </div>
      {state.preset === "custom" && Object.keys(DEFAULT_SCORING[game]).filter(key => game !== "9-point" || key !== "handicap").map(key => {
        const value = (config as Record<string, number | boolean | string>)[key];
        return <label key={key} className={styles.scoringRow}><span>{labelFor(key)}</span>
          {typeof value === "boolean" ? <button type="button" className={styles.compactToggle} aria-label={labelFor(key)} aria-pressed={value} onClick={() => change(key, !value)}><span className={styles.compactToggleTrack} /></button>
            : typeof value === "number" ? <input aria-label={labelFor(key)} type="number" min={0} max={10000} step="any" value={value} onChange={event => { const next = event.target.valueAsNumber; if (Number.isFinite(next) && next >= 0 && next <= 10000) change(key, next); }} />
              : <select aria-label={labelFor(key)} value={value} onChange={event => change(key, event.target.value)}><option value="none">No points</option><option value="carryover">Carryover</option></select>}
        </label>;
      })}
    </fieldset>
    {state.preset === "custom" && warnings.length > 0 && <p className={styles.previewNote} role="status">Warning: {warnings.join(" ")} Custom allocations are allowed.</p>}
    <div className={styles.compactStatus}>{locked ? "Started · Locked" : "Scheduled"}</div>
    <GolfGameScoringPreview setup={{ id: game, scope: "round", participants: GAME_PREVIEW_PLAYERS.slice(0, count).map(player => player.id), handicap: config.handicap, scoring: state.scoring, rounds: [{ id: "settings-preview", holes: 18 }] }} onStart={() => setState(current => startGameSettings(current))} />
  </>;
}
