"use client";

import { useState } from "react";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";
import { FORMATS, FORMAT_KEYS } from "@/lib/platform/formats";
import styles from "../TournamentDashboard.module.css";
import { EditorActions, Field, asInput, type EditorProps } from "../editorKit";

type RoundRow = { day: string; label: string; format: string; courseId: string };

export function RoundsEditor({ setup, saving, onSave, onCancel }: EditorProps) {
  const [rounds, setRounds] = useState<RoundRow[]>(setup.rounds.map((round) => ({ day: asInput(round.day), label: round.label ?? "", format: round.format ?? "", courseId: round.courseId ?? "" })));
  const update = (index: number, patch: Partial<RoundRow>) => setRounds((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const individual = setup.competitionType === "individual";
  const submit = () => onSave({ rounds: rounds.map((round) => ({ day: round.day, label: round.label, format: round.format || null, courseId: round.courseId || null })) });
  return <form onSubmit={(event) => { event.preventDefault(); submit(); }} noValidate>
    <div className={base.fields}>
      <p className={base.muted}>Planned rounds only. Pairings and live scoring come later. Removing the last round also removes its schedule.</p>
      {individual && <p className={base.callout}>Individual formats aren&apos;t supported yet, so rounds stay TBD. Switch to a team tournament in Teams to choose formats.</p>}
      <div className={styles.rows}>{rounds.map((round, index) =>
        <div className={`${styles.row} ${styles.row4}`} key={index}>
          <Field label={`Round ${index + 1} format`}>
            <select value={round.format} disabled={individual} onChange={(event) => update(index, { format: event.target.value })}>
              <option value="">TBD — decide later</option>
              {FORMAT_KEYS.map((key) => <option key={key} value={key}>{FORMATS[key].label}</option>)}
            </select>
          </Field>
          <Field label="Course">
            <select value={round.courseId} onChange={(event) => update(index, { courseId: event.target.value })}>
              <option value="">{setup.courses.length ? "Choose later" : "Add courses first"}</option>
              {setup.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            </select>
          </Field>
          <Field label="Day"><input type="number" min={1} max={14} value={round.day} onChange={(event) => update(index, { day: event.target.value })} /></Field>
          <Field label="Label"><input value={round.label} maxLength={40} placeholder="Morning" onChange={(event) => update(index, { label: event.target.value })} /></Field>
          <button type="button" className={styles.removeButton} onClick={() => setRounds((rows) => rows.filter((_, i) => i !== index))} disabled={rounds.length <= 1} aria-label={`Remove round ${index + 1}`}>Remove</button>
        </div>)}
      </div>
      {rounds.length < 20 && <button type="button" className={base.textButton} onClick={() => setRounds((rows) => [...rows, { day: "", label: "", format: "", courseId: "" }])}>+ Add a round</button>}
    </div>
    <EditorActions saving={saving} onCancel={onCancel} />
  </form>;
}
