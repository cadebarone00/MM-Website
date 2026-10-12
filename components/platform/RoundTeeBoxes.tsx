"use client";

import { Fragment, useEffect, useState } from "react";
import toggleStyles from "./GolfTripCompetition.module.css";
import styles from "./RoundTeeBoxes.module.css";

/** A round's tees: one tee box for every hole, or (Set per hole) a tee chosen hole by hole. */
export type RoundTees = { tee: string | null; perHole: boolean; holeTees: Record<number, string>; locked?: boolean; savedCourseRef?: string };
export const NO_ROUND_TEES: RoundTees = { tee: null, perHole: false, holeTees: {} };

type ScorecardHole = { number: number; par: number; strokeIndex?: number; yards: Record<string, number> };
type Detail = { teeSets: { name: string; totalYards?: number }[]; scorecard?: ScorecardHole[]; attribution: string };

const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];

/**
 * Golf Schedule → a round's page, under its format line: the course's tee boxes, then its scorecard.
 * Tee box: pick one for the whole round. Set per hole: on = choose the tee on each hole right in the scorecard; off = hide the per-hole scorecard and use the round tee. Scorecard: Hole and Par on the left, the hole's tee and its yardage on the right;
 * holes 1–9, OUT, 10–18, IN, TOTAL. Always the same size while it loads ("—"), so nothing jumps.
 */
export function RoundTeeBoxes({ courseRef, value: savedValue, onChange: commit, playLocked = false, affectedCards = 0 }: { courseRef?: string; value: RoundTees; onChange: (next: RoundTees, reason?: string) => void; playLocked?: boolean; affectedCards?: number }) {
  const [correction, setCorrection] = useState<RoundTees | null>(null);
  const [reason, setReason] = useState("");
  const value = correction ?? savedValue;
  const onChange = (next: RoundTees) => { if (correction) setCorrection(next); else if (!playLocked) commit(next); };
  const [detail, setDetail] = useState<{ ref: string; data: Detail | "unavailable" } | null>(null);
  useEffect(() => {
    if (!courseRef) return;
    const controller = new AbortController();
    fetch(`/api/courses/${encodeURIComponent(courseRef)}`, { signal: controller.signal })
      .then(response => response.json() as Promise<{ ok: boolean; course?: Detail }>)
      .then(body => setDetail({ ref: courseRef, data: body.ok && body.course ? body.course : "unavailable" }))
      .catch((error: Error) => { if (error.name !== "AbortError") setDetail({ ref: courseRef, data: "unavailable" }); });
    return () => controller.abort();
  }, [courseRef]);

  if (!courseRef) return <p className={styles.note}>Pick this round&apos;s course (Edit, above) to see its tee boxes and yardages.</p>;
  const data = detail?.ref === courseRef ? detail.data : null; // null = loading
  if (data === "unavailable") return <p className={styles.note}>Tee boxes and yardages aren&apos;t available for this course right now.</p>;

  const locked = !correction && (playLocked || Boolean(value.locked && value.savedCourseRef === courseRef));
  const tees = data?.teeSets.map(set => set.name) ?? [];
  const roundTee = value.tee && tees.includes(value.tee) ? value.tee : tees[0] ?? null;
  const holes = new Map((data?.scorecard ?? []).map(hole => [hole.number, hole]));
  const teeFor = (number: number) => value.perHole ? value.holeTees[number] ?? roundTee : roundTee;
  const yardsOn = (number: number) => { const hole = holes.get(number), tee = teeFor(number); return hole && tee ? hole.yards[tee] : undefined; };
  const sum = (numbers: number[], pick: (number: number) => number | undefined) => {
    const values = numbers.map(pick).filter((v): v is number => typeof v === "number");
    return values.length ? values.reduce((a, b) => a + b, 0) : undefined;
  };
  const parOf = (number: number) => holes.get(number)?.par;
  const hasBack = !data || BACK.some(number => holes.has(number));
  const playedHoles = (data?.scorecard ?? []).map(hole => hole.number);
  const mixed = value.perHole && new Set(playedHoles.map(teeFor).filter(Boolean)).size > 1;
  const selectedYards = playedHoles.map(yardsOn);
  const mixedYards = selectedYards.length && selectedYards.every(yards => typeof yards === "number")
    ? selectedYards.reduce<number>((total, yards) => total + (yards ?? 0), 0) : null;
  const shown = (v: number | undefined) => v === undefined ? "—" : v.toLocaleString("en-US");

  const saveOrUndo = () => {
    if (playLocked && !correction) { setCorrection({ ...savedValue, locked: false }); return; }
    const next = { ...value, tee: roundTee, locked: correction ? true : !locked, savedCourseRef: courseRef };
    if (correction) { if (!reason.trim()) return; commit(next, reason.trim()); setCorrection(null); setReason(""); }
    else onChange(next);
  };
  const saveButton = <button type="button" className={styles.save} disabled={(!locked && (!data || !roundTee)) || Boolean(correction && !reason.trim())} onClick={saveOrUndo}>{correction ? "Save Correction" : playLocked ? "Correct course setup" : locked ? "Undo & Change" : "Save Yardages"}</button>;

  const holeRow = (number: number) => {
    const hole = holes.get(number);
    const tee = teeFor(number);
    const choices = hole ? tees.filter(name => hole.yards[name] !== undefined) : [];
    return <tr key={number}>
      <th scope="row">{number}</th>
      <td className={styles.par}>{shown(parOf(number))}</td>
      <td className={styles.spacer} />
      <td className={styles.tee}>{value.perHole && choices.length > 0
        ? <select disabled={locked} aria-label={`Hole ${number} tee`} value={tee ?? ""} onChange={event => onChange({ ...value, holeTees: { ...value.holeTees, [number]: event.target.value } })}>
          {choices.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        : tee ?? "—"}</td>
      <td className={styles.yards}>{shown(yardsOn(number))}</td>
    </tr>;
  };
  const totalRow = (label: string, numbers: number[]) => <tr className={styles.total}>
    <th scope="row">{label}</th>
    <td className={styles.par}>{shown(sum(numbers, parOf))}</td>
    <td className={styles.spacer} />
    <td className={styles.tee} />
    <td className={styles.yards}>{shown(sum(numbers, yardsOn))}</td>
  </tr>;

  return <section className={styles.tees} aria-label="Tee boxes">
    <div className={styles.group} role="group" aria-label="Tee box">
      <span className={styles.heading}>Tee box</span>
      {data ? <select className={styles.roundSelect} aria-label="Round tee box" value={mixed ? "__mixed__" : roundTee ?? ""} disabled={locked || !tees.length}
        onChange={event => onChange({ ...value, tee: event.target.value })}>
        {mixed && <option value="__mixed__" disabled>Mixed{mixedYards === null ? "" : ` (${mixedYards.toLocaleString("en-US")} yds)`}</option>}
        {!tees.length && <option value="">No tee boxes available</option>}
        {data.teeSets.map(set => <option key={set.name} value={set.name}>{set.name}{set.totalYards ? ` (${set.totalYards.toLocaleString("en-US")} yds)` : ""}</option>)}
      </select> : <span className={styles.loading} role="status">Loading tee boxes...</span>}
    </div>
    {saveButton}
    {correction && <div className={styles.note}>
      <label>Reason for correction<textarea aria-label="Reason for course correction" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} /></label>
      <p>{affectedCards} saved player cards need review after this correction. Scores are not recalculated.</p>
      <button type="button" onClick={() => { setCorrection(null); setReason(""); }}>Cancel correction</button>
    </div>}
    <div className={styles.perHole}>
      <span className={styles.heading}>Set per hole</span>
      <button type="button" role="switch" disabled={locked} aria-checked={value.perHole} aria-label="Set tee box per hole" className={toggleStyles.toggle} onClick={() => onChange({ ...value, perHole: !value.perHole })}>
        <span className={toggleStyles.track} data-on={value.perHole}><span className={toggleStyles.thumb} /></span><span>{value.perHole ? "On" : "Off"}</span>
      </button>
    </div>
    {value.perHole && <table className={styles.card} aria-label="Per-hole tee scorecard">
      <thead><tr><th scope="col">Hole</th><th scope="col" className={styles.par}>Par</th><td className={styles.spacer} /><th scope="col" className={styles.tee}>Tee</th><th scope="col" className={styles.yards}>Yds</th></tr></thead>
      <tbody>
        {FRONT.map(holeRow)}
        {totalRow("Out", FRONT)}
        {hasBack && <Fragment>{BACK.map(holeRow)}{totalRow("In", BACK)}</Fragment>}
        {totalRow("Total", hasBack ? [...FRONT, ...BACK] : FRONT)}
      </tbody>
    </table>}
    {value.perHole && saveButton}
    {data?.attribution && <p className={styles.credit}>{data.attribution}</p>}
  </section>;
}
