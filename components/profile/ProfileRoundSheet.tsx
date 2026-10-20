"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ProfileHistoryRound } from "@/lib/platform/playerRoundsRows";
import { shapeForToPar } from "@/lib/golf/holeResult";
import styles from "@/components/platform/GolfTripMatch.module.css";

/**
 * Profile → Rounds → one round: the Golf Trip's public trip profile sheet (PlayerPublicTripProfile in
 * components/platform/GolfTripMatch.tsx), with the same styles, for just this round. One round tab (course · date), its
 * scorecard, then the snapshot: Round (+/−, Thru) and this round's Score and Handicap differential.
 *
 * The sheet, scorecard and drag-to-close are a copy of the trip's while GolfTripMatch.tsx is being worked on elsewhere;
 * later both should share one component so they can't drift apart.
 */

const shortDay = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const toPar = (n: number) => n === 0 ? "E" : n > 0 ? `+${n}` : String(n);
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "?";

export function ProfileRoundSheet({ round, name, avatarUrl, onClose }: { round: ProfileHistoryRound; name: string; avatarUrl: string | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  // Put it away: slide the sheet down, then close. Same for the X, a tap on the line at the top, and a drag down.
  const dismiss = () => {
    const dialog = dialogRef.current;
    if (!dialog || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onClose(); return; }
    dialog.style.transition = "translate 200ms ease-in";
    dialog.style.translate = "0 100%";
    window.setTimeout(onClose, 200);
  };
  // Drag the header down: past 90px (or a quick flick) closes it, otherwise it springs back. A still press on the line is a tap.
  const drag = useRef<{ startY: number; startTime: number; dy: number; onHandle: boolean } | null>(null);
  const onDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startTime: event.timeStamp, dy: 0, onHandle: !!target.closest("[data-handle]") };
    if (dialogRef.current) dialogRef.current.style.transition = "none";
  };
  const onDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = drag.current;
    if (!gesture || !dialogRef.current) return;
    gesture.dy = Math.max(0, event.clientY - gesture.startY);
    dialogRef.current.style.translate = `0 ${gesture.dy}px`;
  };
  const onDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = drag.current;
    drag.current = null;
    const dialog = dialogRef.current;
    if (!gesture || !dialog) return;
    const flick = gesture.dy / Math.max(1, event.timeStamp - gesture.startTime) > 0.5;
    if (gesture.dy > 90 || (gesture.dy > 20 && flick) || (gesture.dy < 6 && gesture.onHandle)) { dismiss(); return; }
    dialog.style.transition = "translate 200ms ease-out";
    dialog.style.translate = "0 0";
  };

  // Holes in order; a hole with no par or score stays blank on the card and out of the +/−.
  const holes = Array.from({ length: 18 }, (_, i) => round.holes.find((h) => h.number === i + 1) ?? null);
  const scored = holes.filter((h): h is NonNullable<typeof h> => h !== null && Number.isInteger(h.strokes) && Number.isInteger(h.par));
  const roundToPar = scored.length ? toPar(scored.reduce((s, h) => s + h.strokes - h.par, 0)) : "—";
  const tab = `${round.course.name} · ${shortDay(round.datePlayed)}`;

  return createPortal(<dialog ref={dialogRef} className={styles.leaderboardScoreSheet} aria-label={`${name} · ${tab}`} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientY < r.top || event.clientX < r.left || event.clientX > r.right) onClose(); } }}>
    <div className={styles.playerTripProfileHeader} onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
      <span className={styles.playerTripProfileHandle} data-handle aria-hidden><span className={styles.scoreSheetHandle} /></span>
      <span className={styles.playerTripProfileAvatar} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- a stored photo URL, shown as-is */}
        {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(name)}
      </span>
      <h2>{name}</h2>
      <button type="button" className={styles.playerTripProfileClose} onClick={dismiss} autoFocus aria-label="Close round"><X size={18} strokeWidth={2.25} aria-hidden /></button>
    </div>
    <div className={styles.profileRoundTabs} role="tablist" aria-label="Round">
      <button type="button" role="tab" id="profile-history-round-tab" aria-controls="profile-history-round-panel" aria-selected>{tab}</button>
    </div>
    <section id="profile-history-round-panel" className={styles.playerTripProfileScorecard} role="tabpanel" aria-labelledby="profile-history-round-tab">
      <Scorecard par={holes.map((h) => h?.par ?? null)} scores={holes.map((h) => h?.strokes ?? null)} name={name} />
    </section>
    <section className={styles.profileRoundSnapshot} aria-label="Round snapshot">
      <div className={styles.snapshotSections}>
        <div className={styles.snapshotColumn} role="group" aria-label="Round snapshot">
          <h4>Round</h4>
          <dl className={styles.snapshotPill}>
            <div><dt>+/&minus;</dt><dd>{roundToPar}</dd></div>
            <div><dt>Thru</dt><dd>{scored.length || "—"}</dd></div>
          </dl>
        </div>
        <span className={styles.snapshotDivider} aria-hidden />
        <div className={styles.snapshotColumn} role="group" aria-label="Score and handicap">
          <h4>{round.holesPlayed} holes</h4>
          <dl className={styles.snapshotPill}>
            <div><dt>Score</dt><dd>{round.total}</dd></div>
            {/* The differential when the round counts; "—" when it doesn't (the Rounds list says why), so both pills stay one size. */}
            <div><dt>Handicap</dt><dd aria-label={round.countsForHandicap && round.differential !== null ? undefined : "Not counted"}>{round.countsForHandicap && round.differential !== null ? round.differential.toFixed(1) : "—"}</dd></div>
          </dl>
        </div>
      </div>
    </section>
  </dialog>, document.body);
}

/** The trip's scorecard (Hole / Par / Score, OUT / IN / TOT, birdie circles and bogey boxes). */
function Scorecard({ par, scores, name }: { par: (number | null)[]; scores: (number | null)[]; name: string }) {
  const sum = (values: (number | null)[]) => {
    const played = values.filter((v): v is number => v !== null);
    return played.length ? played.reduce((a, b) => a + b, 0) : null;
  };
  const nine = (start: number) => Array.from({ length: 9 }, (_, i) => start + i);
  const columns: { label: string; par: number | null; score: number | null; total?: boolean }[] = [
    ...nine(0).map((i) => ({ label: String(i + 1), par: par[i], score: scores[i] })),
    { label: "OUT", par: sum(par.slice(0, 9)), score: sum(scores.slice(0, 9)), total: true },
    ...nine(9).map((i) => ({ label: String(i + 1), par: par[i], score: scores[i] })),
    { label: "IN", par: sum(par.slice(9, 18)), score: sum(scores.slice(9, 18)), total: true },
    { label: "TOT", par: sum(par), score: sum(scores), total: true },
  ];
  return <div className={styles.scorecard} role="region" aria-label={`${name} scorecard`} tabIndex={0}>
    <table className={styles.scorecardTable}>
      <tbody>
        <tr><th scope="row">Hole</th>{columns.map((c) => <td key={c.label} className={c.total ? styles.totalCell : ""}>{c.label}</td>)}</tr>
        <tr><th scope="row">Par</th>{columns.map((c) => <td key={c.label} className={c.total ? styles.totalCell : ""}>{c.par ?? ""}</td>)}</tr>
        <tr><th scope="row">Score</th>{columns.map((c) => <td key={c.label} className={c.total ? styles.totalCell : ""}>
          {c.score === null ? "" : c.total || c.par === null ? c.score : <span className={scoreMark(c.score - c.par)}>{c.score}</span>}
        </td>)}</tr>
      </tbody>
    </table>
  </div>;
}

/** Birdie circle / eagle-or-better double circle / bogey box / double box, from the shared hole classifier. */
function scoreMark(diff: number): string {
  const { outline, rings } = shapeForToPar(diff);
  if (outline === "none") return styles.mark;
  return `${styles.mark} ${outline === "circle" ? styles.circle : styles.box}${rings === 2 ? ` ${styles.double}` : ""}`;
}
