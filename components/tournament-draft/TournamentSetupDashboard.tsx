"use client";

import type { RefObject } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { draftSetup, type TournamentDraft } from "@/lib/platform/tournamentDraft";
import styles from "./TournamentDraftWorkspace.module.css";

/**
 * The Tournament Setup view (COMPLETE), shared by the local draft preview
 * and a saved tournament's dashboard. Section statuses come from
 * draftSetup() in lib/platform, never from this component.
 */
export function TournamentSetupDashboard({ draft, headingRef, onEdit, onDownload, onReview, savedNote }: {
  draft: TournamentDraft;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  /** Omitted for saved tournaments until section editing is persistent. */
  onEdit?: (step: number) => void;
  onDownload?: () => void;
  onReview?: () => void;
  savedNote?: string;
}) {
  const setup = draftSetup(draft);
  const dates = draft.basics.startDate ? `${draft.basics.startDate} – ${draft.basics.endDate}` : `${draft.seasonYear} · dates to be decided`;
  return <section className={styles.dashboard}>
    <div className={styles.setupHeader}><div><span className={styles.eyebrow}>{savedNote ? "SAVED TOURNAMENT" : "DRAFT TOURNAMENT"}</span><h2 ref={headingRef} tabIndex={-1}>Tournament Setup — {setup.percent}% Complete</h2><p>{dates} · {draft.basics.timezone}</p><p>{draft.expectedPlayerCount} planned players · {draft.rounds.length} rounds · {draft.basics.visibility} when published</p></div>{onDownload && <button className={styles.primary} onClick={onDownload}>Download draft JSON</button>}</div>
    <progress aria-label="Tournament setup completion" value={setup.percent} max={100} />
    <p className={styles.muted}>{setup.completed} of {setup.total} required setup sections complete. Optional sections and locked publishing features do not affect this percentage.</p>
    {savedNote && <p className={styles.callout}>{savedNote}</p>}
    <div className={styles.cards}>{setup.sections.map(section => <article className={styles.card} key={section.name}>
      <div className={styles.cardTop}><h3>{section.name}</h3><span className={styles.badge} data-status={section.status}>{section.status === "Locked" && <LockKeyhole size={12} aria-hidden="true" />}{section.status}</span></div>
      <p>{section.detail}</p>
      {section.step !== undefined && onEdit ? <button className={styles.textButton} onClick={() => onEdit(section.step!)}>Edit {section.name.toLowerCase()} <ArrowRight size={14} aria-hidden="true" /></button> : <span className={styles.muted}>{section.status === "Locked" ? "Unavailable in draft preview" : section.name === "Teams" && !draft.teams.length ? "Individual competition" : onEdit ? "Setup tools coming later" : "Editing saved tournaments comes next"}</span>}
    </article>)}</div>
    {onDownload && <details className={styles.json}><summary>View draft configuration</summary><pre>{JSON.stringify(draft, null, 2)}</pre></details>}
    {onReview && <button className={styles.secondary} onClick={onReview}>Review and edit draft</button>}
  </section>;
}
