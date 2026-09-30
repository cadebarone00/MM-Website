"use client";

import { useState } from "react";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";
import styles from "../TournamentDashboard.module.css";
import { EditorActions, Field, type EditorProps } from "../editorKit";

type ScheduleRow = { number: number; playDate: string; startType: string; startTime: string };

export function ScheduleEditor({ setup, saving, onSave, onCancel }: EditorProps) {
  const [rows, setRows] = useState<ScheduleRow[]>(setup.rounds.map((round) => ({ number: round.number, playDate: round.playDate ?? "", startType: round.startType ?? "", startTime: round.startTime ?? "" })));
  const update = (index: number, patch: Partial<ScheduleRow>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const { startDate, endDate } = setup.edition;
  return <form onSubmit={(event) => { event.preventDefault(); onSave({ rounds: rows }); }} noValidate>
    <div className={base.fields}>
      {!startDate && <p className={base.callout}>Set the tournament&apos;s dates in Basics first; round dates must fall inside them.</p>}
      <div className={styles.rows}>{rows.map((row, index) =>
        <div className={`${styles.row} ${styles.row3}`} key={row.number}>
          <Field label={`Round ${row.number} date`}><input type="date" min={startDate ?? undefined} max={endDate ?? undefined} value={row.playDate} onChange={(event) => update(index, { playDate: event.target.value })} /></Field>
          <Field label="Start">
            <select value={row.startType} onChange={(event) => update(index, { startType: event.target.value })}>
              <option value="">Decide later</option>
              <option value="tee_times">Tee times</option>
              <option value="shotgun">Shotgun start</option>
            </select>
          </Field>
          <Field label={row.startType === "shotgun" ? "Shotgun time" : "First tee time"}><input type="time" value={row.startTime} onChange={(event) => update(index, { startTime: event.target.value })} /></Field>
          <span />
        </div>)}
      </div>
      <p className={base.muted}>Pairings are set when live scoring opens for new tournaments.</p>
    </div>
    <EditorActions saving={saving} onCancel={onCancel} />
  </form>;
}
