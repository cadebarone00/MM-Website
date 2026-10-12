"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { ShotResult } from "@/lib/platform/playerRounds";
import { DIRECTION_MARK, scoreShape, sumOf } from "./GolfTripScoring";
import scoringStyles from "./GolfTripScoring.module.css";
import tripStyles from "./GolfTripHome.module.css";
import styles from "./OrganizerScorecard.module.css";

export interface CardHole { strokes: number | null; putts: number | null; fairway: ShotResult | null; green: ShotResult | null }
type Field = keyof CardHole;
const FIELDS: Field[] = ["strokes", "putts", "fairway", "green"];
const SHOTS: ShotResult[] = ["up", "left", "center", "right", "down"];
const SHOT_NAMES: Record<ShotResult, string> = { up: "Long", left: "Left", center: "Hit", right: "Right", down: "Short" };

/**
 * Settings → Scorecards → a player: their card for one round, laid out like the Scoring sheet's vertical Card view (Hole ·
 * Yds · Par | FWY · GRN · PUT | score). Once the player has submitted, the organizer taps any score or stat to change it
 * (changed cells turn gold), then Save Score asks to confirm: for the Golf Trip only, or for the Golf Trip and the player's
 * account. Before they submit, the card is view only (the player is still scoring it).
 */
export function OrganizerScorecard({ name, par, holes, editable, competition, onSave }: {
  name: string; par: number[]; holes: CardHole[];
  /** The player has submitted this round: only then can the organizer change it. */
  editable: boolean;
  /** The trip has a competition and this round counts toward it: the confirm warns about competition outcomes. */
  competition: boolean;
  onSave: (holes: CardHole[], account: boolean) => void;
}) {
  const [draft, setDraft] = useState(holes);
  const [confirm, setConfirm] = useState(false);
  const changed = (i: number, field: Field) => draft[i][field] !== holes[i][field];
  const dirty = draft.some((_, i) => FIELDS.some(field => changed(i, field)));
  const set = (i: number, field: Field, value: CardHole[Field]) => setDraft(current => current.map((hole, h) => h === i ? { ...hole, [field]: value } : hole));
  const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
  const hits = (field: "fairway" | "green", index: number[]) => index.some(i => draft[i][field] !== null) ? index.filter(i => draft[i][field] === "center").length : "—";
  const gap = <td className={scoringStyles.sectionGap} aria-hidden />;
  const save = (account: boolean) => { onSave(draft, account); setConfirm(false); };

  // One tappable cell: the value as the card shows it, with a picker over it.
  const cell = (i: number, field: Field, shown: ReactNode, options: { value: string; label: string }[], extra = "") => !editable
    ? <td className={`${scoringStyles.section} ${extra}`}>{shown}</td>
    : <td className={`${scoringStyles.section} ${extra} ${styles.editCell}`} data-changed={changed(i, field) || undefined}>
      {shown}
      <select className={styles.picker} aria-label={`Hole ${i + 1} ${field === "strokes" ? "score" : field}`} value={String(draft[i][field] ?? "")}
        onChange={event => {
          const raw = event.target.value;
          set(i, field, raw === "" ? null : field === "strokes" || field === "putts" ? Number(raw) : raw as ShotResult);
        }}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </td>;
  const numbers = (from: number, to: number) => [{ value: "", label: "—" }, ...range(from, to + 1).map(n => ({ value: String(n), label: String(n) }))];
  const shots = [{ value: "", label: "—" }, ...SHOTS.map(shot => ({ value: shot, label: `${DIRECTION_MARK[shot]} ${SHOT_NAMES[shot]}` }))];
  const mark = (value: ShotResult | null) => value ? DIRECTION_MARK[value] : "—";

  const holeRow = (i: number) => {
    const strokes = draft[i].strokes;
    return <tr key={i}>
      <th scope="row" className={scoringStyles.section}>{i + 1}</th><td className={scoringStyles.section}>—</td><td className={scoringStyles.section}>{par[i] ?? "—"}</td>{gap}
      {par[i] === 3 ? <td className={scoringStyles.section} /> : cell(i, "fairway", mark(draft[i].fairway), shots)}
      {cell(i, "green", mark(draft[i].green), shots)}
      {cell(i, "putts", draft[i].putts ?? "—", numbers(0, 10))}{gap}
      {cell(i, "strokes", strokes === null ? "—" : par[i] === undefined ? strokes : <span className={scoreShape(strokes - par[i])}>{strokes}</span>, numbers(1, 20), scoringStyles.myScore)}
    </tr>;
  };
  const totalRow = (label: string, index: number[]) => <tr key={label} className={scoringStyles.totalRow}>
    <th scope="row" className={scoringStyles.section}>{label}</th><td className={scoringStyles.section}>—</td><td className={scoringStyles.section}>{sumOf(index.map(i => par[i]))}</td>{gap}
    <td className={scoringStyles.section}>{hits("fairway", index)}</td><td className={scoringStyles.section}>{hits("green", index)}</td><td className={scoringStyles.section}>{sumOf(index.map(i => draft[i].putts))}</td>{gap}
    <td className={`${scoringStyles.section} ${scoringStyles.myScore}`}>{sumOf(index.map(i => draft[i].strokes))}</td>
  </tr>;
  const shortName = (name.trim().split(/\s+/).at(-1) ?? name).slice(0, 8);

  return <div className={styles.sheet}>
    <section className={scoringStyles.scorecardView} aria-label="Scorecard">
      <table className={scoringStyles.scorecardTable}>
        <colgroup>{["12%", "12%", "11%", "3%", "12%", "12%", "11%", "3%", "24%"].map((width, i) => <col key={i} style={{ width }} />)}</colgroup>
        <thead><tr>
          <th scope="col" className={scoringStyles.section}>Hole</th><th scope="col" className={scoringStyles.section}>Yds</th><th scope="col" className={scoringStyles.section}>Par</th><th className={scoringStyles.sectionGap} aria-hidden />
          <th scope="col" className={scoringStyles.section}>FWY</th><th scope="col" className={scoringStyles.section}>GRN</th><th scope="col" className={scoringStyles.section}>PUT</th><th className={scoringStyles.sectionGap} aria-hidden />
          <th scope="col" className={`${scoringStyles.section} ${scoringStyles.nameHead}`} title={name}>{shortName}</th>
        </tr></thead>
        <tbody>
          {range(0, 9).map(holeRow)}{totalRow("Out", range(0, 9))}
          {range(9, 18).map(holeRow)}{totalRow("In", range(9, 18))}
          {totalRow("Total", range(0, 18))}
        </tbody>
      </table>
      <dl className={`${scoringStyles.scorecardTotals} ${styles.total}`}>
        <div><dt title={name} style={{ "--chars": shortName.length } as CSSProperties}>{shortName}</dt><dd>{sumOf(draft.map(hole => hole.strokes))}</dd></div>
      </dl>
    </section>
    {/* Gold once something on the card changed; greyed out (can't be tapped) while nothing has. */}
    {editable ? <button type="button" className={styles.saveScore} disabled={!dirty} onClick={() => setConfirm(true)}>Save Score</button>
      : <p className={styles.viewOnly}>{name} hasn&apos;t submitted this round yet. Scores can be edited here after they submit.</p>}

    {confirm && <div className={tripStyles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Confirm score edit">
      <div className={tripStyles.deleteDialog}>
        <p className={tripStyles.deletePrompt}>Are you sure you want to edit this score?</p>
        {competition && <p className={styles.warning}>New values could affect competition outcomes.</p>}
        <button type="button" className={tripStyles.cancelButton} onClick={() => setConfirm(false)}>Keep editing</button>
        <button type="button" className={tripStyles.deleteButton} onClick={() => save(false)}>Confirm for Golf Trip</button>
        <button type="button" className={tripStyles.deleteButton} onClick={() => save(true)}>Confirm for Golf Trip and Player&apos;s Account</button>
      </div>
    </div>}
  </div>;
}
