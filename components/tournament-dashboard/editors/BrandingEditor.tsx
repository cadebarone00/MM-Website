"use client";

import { useState } from "react";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";
import { EditorActions, Field, type EditorProps } from "../editorKit";

export function BrandingEditor({ setup, saving, onSave, onCancel }: EditorProps) {
  const [colors, setColors] = useState(setup.tournament.branding ?? { primary: "#1f4e9c", secondary: "#ffffff", accent: "#b8860b", logoUrl: null });
  return <form onSubmit={(event) => { event.preventDefault(); onSave(colors); }} noValidate>
    <div className={base.fields}>
      <p className={base.muted}>Optional. Your site uses these colors when it opens. Logo uploads aren&apos;t part of commercial V1.</p>
      <div className={base.columns}>
        {(["primary", "secondary", "accent"] as const).map((key) =>
          <Field key={key} label={`${key[0].toUpperCase()}${key.slice(1)} color`}><input type="color" value={colors[key]} onChange={(event) => setColors({ ...colors, [key]: event.target.value })} /></Field>)}
      </div>
      <div className={base.colorPreview} style={{ backgroundColor: colors.secondary, borderColor: colors.accent }}><span style={{ backgroundColor: colors.primary }} />{setup.tournament.name}</div>
    </div>
    <EditorActions saving={saving} onCancel={onCancel} />
  </form>;
}
