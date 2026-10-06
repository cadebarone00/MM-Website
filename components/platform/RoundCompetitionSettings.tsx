"use client";

import { useState } from "react";
import { Info, Minus, Plus } from "lucide-react";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import gamesStyles from "./GolfTripGames.module.css";
import { MATCH_TYPES, ROUND_FORMATS, SCORING_OPTIONS, playersLeftOver, playersPerSide, pointsPerMatchTotal, roundMatches, roundPointsAvailable, type RoundCompSettings } from "@/lib/platform/roundCompetition";
import styles from "./GolfTripSettingsPreview.module.css";
import toggleStyles from "./GolfTripCompetition.module.css";

const points = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);

/**
 * Competition → Format → a comp round: players, format, match type, points per match, Nassau, scoring, and the points this round
 * makes available. Changes are a draft until Submit & Save; leaving another way keeps the last saved settings.
 */
export function RoundCompetitionSettings({ course, date, round, settings: saved, maxPlayers, onSubmit }: {
  course: string; date: string; round: number; settings: RoundCompSettings; maxPlayers: number; onSubmit: (next: RoundCompSettings) => void;
}) {
  const [settings, setSettings] = useState(saved);
  // Format rules pop-up: the list of formats, then one format's rules.
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesFor, setRulesFor] = useState<(typeof ROUND_FORMATS)[number] | null>(null);
  const set = (change: Partial<RoundCompSettings>) => setSettings(current => ({ ...current, ...change }));
  const matches = roundMatches(settings), leftOver = playersLeftOver(settings), matchPlay = settings.matchType === "Match Play";
  return <div className={styles.roundComp}>
    {/* Above the line: course, then date and round. Right under it: the format ovals in two columns. */}
    <div className={styles.roundDayHeader}>
      <h2>{course}</h2>
      <time>{date} · Round {round}</time>
    </div>
    <div className={styles.typeGroup} role="group" aria-label="Format">
      <div className={styles.formatHeading}>
        <h4 className={styles.typeHeading}>Format</h4>
        <button type="button" className={styles.formatInfo} aria-haspopup="dialog" aria-label="Format rules" onClick={() => { setRulesFor(null); setRulesOpen(true); }}><Info size={18} strokeWidth={2} aria-hidden /></button>
      </div>
      <div className={styles.formatColumns}>
        {ROUND_FORMATS.map(({ name }) => <button key={name} type="button" className={styles.typeChoice} aria-pressed={settings.format === name} onClick={() => set({ format: name })}>{name}</button>)}
      </div>
    </div>

    <div className={styles.totalPlayers} role="group" aria-label="Players playing">
      <span className={styles.typeHeading}>Players playing</span>
      <div className={`${styles.typeChoice} ${styles.stepper}`}>
        <button type="button" aria-label="Fewer players" disabled={settings.players <= 2} onClick={() => set({ players: settings.players - 1 })}><Minus size={14} strokeWidth={2.5} aria-hidden /></button>
        <span aria-live="polite">{settings.players}</span>
        <button type="button" aria-label="More players" disabled={settings.players >= maxPlayers} onClick={() => set({ players: settings.players + 1 })}><Plus size={14} strokeWidth={2.5} aria-hidden /></button>
      </div>
    </div>

    <div className={styles.typeGroup} role="group" aria-label="Match type">
      <h4 className={styles.typeHeading}>Match type</h4>
      <div className={styles.roundCompChoices}>
        {MATCH_TYPES.map(type => <button key={type} type="button" className={styles.typeChoice} aria-pressed={settings.matchType === type} onClick={() => set({ matchType: type })}>{type}</button>)}
      </div>
    </div>

    <div className={styles.typeGroup} role="group" aria-label="Scoring">
      <h4 className={styles.typeHeading}>Handicap</h4>
      <div className={styles.roundCompChoices}>
        {SCORING_OPTIONS.map(option => <button key={option} type="button" className={styles.typeChoice} aria-pressed={settings.scoring === option} onClick={() => set({ scoring: option })}>{option}</button>)}
      </div>
    </div>

    <div className={styles.totalPlayers} role="group" aria-label="Points per match">
      <span className={styles.typeHeading}>Points per match</span>
      <div className={`${styles.typeChoice} ${styles.stepper}`}>
        <button type="button" aria-label="Fewer points" disabled={settings.pointsPerMatch <= 0.5} onClick={() => set({ pointsPerMatch: settings.pointsPerMatch - 0.5 })}><Minus size={14} strokeWidth={2.5} aria-hidden /></button>
        <span aria-live="polite">{points(settings.pointsPerMatch)}</span>
        <button type="button" aria-label="More points" disabled={settings.pointsPerMatch >= 10} onClick={() => set({ pointsPerMatch: settings.pointsPerMatch + 0.5 })}><Plus size={14} strokeWidth={2.5} aria-hidden /></button>
      </div>
    </div>

    <div className={styles.totalPlayers}>
      <span className={styles.typeHeading}>Nassau</span>
      <button type="button" role="switch" aria-checked={settings.nassau} aria-label="Nassau" className={toggleStyles.toggle} onClick={() => set({ nassau: !settings.nassau })}>
        <span className={toggleStyles.track} data-on={settings.nassau}><span className={toggleStyles.thumb} /></span><span>{settings.nassau ? "On" : "Off"}</span>
      </button>
    </div>

    {/* The math, spelled out: matches × what each match pays = total points available. */}
    <dl className={styles.overview}>
      <div className={styles.overviewRow}><dt>Matches</dt><dd>{matchPlay ? `${matches} · ${playersPerSide(settings.format)} v ${playersPerSide(settings.format)}` : "None (stroke play)"}</dd></div>
      <div className={styles.overviewRow}><dt>Each match pays</dt><dd>{settings.nassau ? `${points(settings.pointsPerMatch)} × 3 (front, back, overall) = ${points(pointsPerMatchTotal(settings))}` : points(settings.pointsPerMatch)}</dd></div>
      <div className={styles.overviewRow}><dt>Total points available</dt><dd>{matchPlay ? points(roundPointsAvailable(settings)) : "—"}</dd></div>
      {leftOver > 0 && <div className={styles.overviewRow}><dt>Not in a match</dt><dd>{leftOver} {leftOver === 1 ? "player" : "players"}</dd></div>}
    </dl>
    <button type="button" className={styles.roundCompSubmit} onClick={() => onSubmit(settings)}>Submit &amp; Save</button>
    {rulesOpen && <GolfTripActionSheet label="Format rules" onClose={() => setRulesOpen(false)}>
      <div className={`${gamesStyles.sheetBody} ${styles.rulesBody}`}>
        {rulesFor ? <>
          <button type="button" className={gamesStyles.sheetBack} onClick={() => setRulesFor(null)}>← All formats</button>
          <h3 className={gamesStyles.sheetTitle}>{rulesFor.name}</h3>
          <p className={gamesStyles.sheetHint}>{rulesFor.perSide} v {rulesFor.perSide} · {rulesFor.summary}</p>
          <ol className={styles.rulesList}>{rulesFor.rules.map(rule => <li key={rule}>{rule}</li>)}</ol>
        </> : <>
          <h3 className={gamesStyles.sheetTitle}>Formats</h3>
          {ROUND_FORMATS.map(format => <button key={format.name} type="button" className={gamesStyles.sheetGame} onClick={() => setRulesFor(format)}>
            <strong>{format.name}</strong><span>{format.summary}</span>
          </button>)}
        </>}
      </div>
    </GolfTripActionSheet>}
  </div>;
}
