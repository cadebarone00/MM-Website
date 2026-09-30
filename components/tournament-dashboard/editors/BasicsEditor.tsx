"use client";

import { useState } from "react";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";
import styles from "../TournamentDashboard.module.css";
import { EditorActions, Field, type EditorProps } from "../editorKit";

const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Mazatlan", "Europe/London", "UTC"];

export function BasicsEditor({ setup, saving, onSave, onCancel }: EditorProps) {
  const [form, setForm] = useState({
    name: setup.tournament.name, shortName: setup.tournament.shortName, description: setup.tournament.description ?? "",
    destination: setup.edition.destination ?? "", startDate: setup.edition.startDate ?? "", endDate: setup.edition.endDate ?? "",
    timezone: setup.edition.timezone, visibility: setup.tournament.visibility,
  });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return <form onSubmit={(event) => { event.preventDefault(); onSave(form); }} noValidate>
    <div className={base.fields}>
      <p className={base.muted}>Web address and year are fixed: /t/{setup.tournament.slug}/{setup.edition.seasonYear}</p>
      <div className={base.columns}>
        <Field label="Tournament name"><input value={form.name} onChange={set("name")} maxLength={80} /></Field>
        <Field label="Short name"><input value={form.shortName} onChange={set("shortName")} maxLength={24} /></Field>
      </div>
      <Field label="Destination"><input value={form.destination} onChange={set("destination")} placeholder="e.g. Horseshoe Bay, TX" maxLength={120} /></Field>
      <Field label="Description"><textarea className={styles.textarea} value={form.description} onChange={set("description")} maxLength={2000} /></Field>
      <div className={base.columns}>
        <Field label="Start date"><input type="date" value={form.startDate} onChange={set("startDate")} /></Field>
        <Field label="End date"><input type="date" value={form.endDate} min={form.startDate} onChange={set("endDate")} /></Field>
      </div>
      <div className={base.columns}>
        <Field label="Timezone"><input list="dashboard-timezones" value={form.timezone} onChange={set("timezone")} /><datalist id="dashboard-timezones">{ZONES.map((zone) => <option key={zone} value={zone} />)}</datalist></Field>
        <Field label="Who can see it once published">
          <select value={form.visibility} onChange={set("visibility")}>
            <option value="private">Private — invited participants</option>
            <option value="unlisted">Unlisted — anyone with the link</option>
            <option value="public">Public — discoverable by everyone</option>
          </select>
        </Field>
      </div>
    </div>
    <EditorActions saving={saving} onCancel={onCancel} />
  </form>;
}
