"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { DEFAULT_SCORING, editGameSettings, initialGameSettings, ninePointWarnings, type ScoringGameId, type ScoringSettings } from "@/lib/platform/game-engine";
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

// Point steppers move in halves (some standard values are 0.5), between 0 and 10000.
const POINT_STEP = 0.5;
const POINT_MAX = 10000;

/** Local state only, deliberately independent of Competition and persistence. Standard / Custom / Reset sit on top and the
 *  settings always show under them: greyed out and locked on Standard, editable on Custom. Reset puts the standard values
 *  back and stays on Custom. */
export function GolfGameScoringSettings({ game }: { game: ScoringGameId }) {
  const [state, setState] = useState(() => initialGameSettings(game));
  const config = state.scoring.values;
  const change = (key: string, value: number | boolean | string) => setState(current => editGameSettings(current, "custom", { ...current.scoring, values: { ...current.scoring.values, [key]: value } } as ScoringSettings));
  const warnings = state.scoring.game === "9-point" ? ninePointWarnings(state.scoring.values) : [];

  return <>
    <fieldset className={styles.scoringFields} aria-label={`${game} scoring settings`}>
      <div className={styles.compactOptions}>
        {(["standard", "custom"] as const).map(preset => <button key={preset} type="button" aria-pressed={state.preset === preset} className={`${styles.compactOption} ${state.preset === preset ? styles.compactOptionActive : ""}`} onClick={() => setState(current => editGameSettings(current, preset))}>{preset === "standard" ? "Standard" : "Custom"}</button>)}
        <button type="button" className={styles.compactOption} disabled={state.preset === "standard"} onClick={() => setState(current => editGameSettings(current, "custom", initialGameSettings(game).scoring))}>Reset</button>
      </div>
      <fieldset className={styles.scoringFields} disabled={state.preset === "standard"} aria-label={state.preset === "standard" ? "Standard settings (locked)" : "Custom settings"}>
      {Object.keys(DEFAULT_SCORING[game]).filter(key => game !== "9-point" || key !== "handicap").map(key => {
        const value = (config as Record<string, number | boolean | string>)[key];
        return <div key={key} className={styles.scoringRow}><span>{labelFor(key)}</span>
          {typeof value === "boolean" ? <button type="button" className={styles.compactToggle} aria-label={labelFor(key)} aria-pressed={value} onClick={() => change(key, !value)}><span className={styles.compactToggleTrack} /></button>
            : typeof value === "number" ? <div className={`${styles.typeChoice} ${styles.stepper}`} role="group" aria-label={labelFor(key)}>
              <button type="button" aria-label={`Less ${labelFor(key)}`} disabled={value <= 0} onClick={() => change(key, Math.max(0, value - POINT_STEP))}><Minus size={14} strokeWidth={2.5} aria-hidden /></button>
              <span aria-live="polite">{value}</span>
              <button type="button" aria-label={`More ${labelFor(key)}`} disabled={value >= POINT_MAX} onClick={() => change(key, Math.min(POINT_MAX, value + POINT_STEP))}><Plus size={14} strokeWidth={2.5} aria-hidden /></button>
            </div>
              : <select aria-label={labelFor(key)} value={value} onChange={event => change(key, event.target.value)}><option value="none">No points</option><option value="carryover">Carryover</option></select>}
        </div>;
      })}
      </fieldset>
    </fieldset>
    {state.preset === "custom" && warnings.length > 0 && <p className={styles.previewNote} role="status">Warning: {warnings.join(" ")} Custom allocations are allowed.</p>}
  </>;
}
