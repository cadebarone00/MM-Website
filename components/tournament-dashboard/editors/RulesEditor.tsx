"use client";

import { useState } from "react";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";
import { EditorActions, Field, type EditorProps } from "../editorKit";

export function RulesEditor({ setup, saving, onSave, onCancel }: EditorProps) {
  const s = setup.scoring;
  const [form, setForm] = useState({
    pointsForWin: String(s?.pointsForWin ?? 1), pointsForHalve: String(s?.pointsForHalve ?? 0.5), handicap: s?.handicap ?? "gross",
    allowancePercent: String(s?.allowancePercent ?? 100), allowEarlyFinish: s?.allowEarlyFinish ?? true, allowConcessions: s?.allowConcessions ?? false,
    individualLeaderboard: s?.individualLeaderboard ?? true,
  });
  const check = (key: "allowEarlyFinish" | "allowConcessions" | "individualLeaderboard", label: string) =>
    <label className={base.checkbox}><input type="checkbox" checked={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>;
  return <form onSubmit={(event) => { event.preventDefault(); onSave({ mode: "match_play", ...form }); }} noValidate>
    <div className={base.fields}>
      <p className={base.muted}>Match play: each match earns points for its team. Stroke-play events come later.</p>
      <div className={base.columns}>
        <Field label="Points for a win"><input type="number" step="0.5" min={0.5} max={10} value={form.pointsForWin} onChange={(event) => setForm({ ...form, pointsForWin: event.target.value })} /></Field>
        <Field label="Points for a halve"><input type="number" step="0.5" min={0} max={10} value={form.pointsForHalve} onChange={(event) => setForm({ ...form, pointsForHalve: event.target.value })} /></Field>
      </div>
      <div className={base.columns}>
        <Field label="Handicaps"><select value={form.handicap} onChange={(event) => setForm({ ...form, handicap: event.target.value as "gross" | "net" })}><option value="gross">Gross (no strokes)</option><option value="net">Net (strokes given)</option></select></Field>
        <Field label="Handicap allowance %"><input type="number" min={0} max={100} value={form.allowancePercent} disabled={form.handicap === "gross"} onChange={(event) => setForm({ ...form, allowancePercent: event.target.value })} /></Field>
      </div>
      {check("allowEarlyFinish", "Matches end once decided (e.g. 3&2)")}
      {check("allowConcessions", "Allow conceded holes and matches")}
      {check("individualLeaderboard", "Also show an individual stroke-play leaderboard")}
    </div>
    <EditorActions saving={saving} onCancel={onCancel} />
  </form>;
}
