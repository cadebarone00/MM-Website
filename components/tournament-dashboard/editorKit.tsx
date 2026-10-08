"use client";

import type { ReactNode } from "react";
import type { TournamentSetup } from "@/lib/platform/setup";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";

/**
 * What every section editor gets. Editors only collect input: the server
 * runs lib/platform/sectionRules.ts and returns any problems, which the
 * dashboard shows. No validation rules live in these components.
 */
export interface EditorProps {
  setup: TournamentSetup;
  saving: boolean;
  onSave: (data: unknown) => void;
  onCancel: () => void;
  /** /api/platform/tournaments/<slug>/<year> — for editors that call their own routes (player invitations). */
  apiBase?: string;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className={base.field}><span>{label}</span>{children}{hint && <small className={base.muted}>{hint}</small>}</label>;
}

export function EditorActions({ saving, onCancel, label = "Save" }: { saving: boolean; onCancel: () => void; label?: string }) {
  return <div className={base.actions}>
    <div><button type="button" className={base.secondary} onClick={onCancel} disabled={saving}>Cancel</button></div>
    <button type="submit" className={base.primary} disabled={saving}>{saving ? "Saving…" : label}</button>
  </div>;
}

/** Number inputs give "" when empty; the server treats "" as not set. */
export const asInput = (value: number | string | null | undefined) => (value === null || value === undefined ? "" : String(value));
