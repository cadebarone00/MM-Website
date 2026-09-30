"use client";

import { useState } from "react";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";
import { SITE_SECTIONS, type SiteSection } from "@/lib/platform/setup";
import styles from "../TournamentDashboard.module.css";
import { EditorActions, type EditorProps } from "../editorKit";

const LABELS: Record<SiteSection, string> = { leaderboard: "Leaderboard", matches: "Matches", schedule: "Schedule", players: "Players", teams: "Teams", courses: "Courses", stats: "Stats", media: "Media", results: "Results", history: "History" };

export function WebsiteEditor({ setup, saving, onSave, onCancel }: EditorProps) {
  const [site, setSite] = useState(setup.site);
  return <form onSubmit={(event) => { event.preventDefault(); onSave(site); }} noValidate>
    <div className={base.fields}>
      <p className={base.muted}>Optional. Choose what your site at /t/{setup.tournament.slug}/{setup.edition.seasonYear} shows once published. Home is always shown.</p>
      <div className={styles.toggles}>{SITE_SECTIONS.map((key) =>
        <label className={base.checkbox} key={key}><input type="checkbox" checked={site[key]} onChange={(event) => setSite({ ...site, [key]: event.target.checked })} />{LABELS[key]}</label>)}
      </div>
    </div>
    <EditorActions saving={saving} onCancel={onCancel} />
  </form>;
}
