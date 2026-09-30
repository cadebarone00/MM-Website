"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import type { Readiness, SectionName } from "@/lib/platform/readiness";
import type { SectionKey } from "@/lib/platform/sectionRules";
import type { TournamentSetup } from "@/lib/platform/setup";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";
import styles from "./TournamentDashboard.module.css";
import type { EditorProps } from "./editorKit";
import { BasicsEditor } from "./editors/BasicsEditor";
import { BrandingEditor } from "./editors/BrandingEditor";
import { CoursesEditor } from "./editors/CoursesEditor";
import { MediaEditor } from "./editors/MediaEditor";
import { PlayersEditor } from "./editors/PlayersEditor";
import { RoundsEditor } from "./editors/RoundsEditor";
import { RulesEditor } from "./editors/RulesEditor";
import { ScheduleEditor } from "./editors/ScheduleEditor";
import { TeamsEditor } from "./editors/TeamsEditor";
import { WebsiteEditor } from "./editors/WebsiteEditor";

const EDITORS: Record<Exclude<SectionName, "Publish">, { key: SectionKey; Editor: ComponentType<EditorProps> }> = {
  Basics: { key: "basics", Editor: BasicsEditor }, Players: { key: "players", Editor: PlayersEditor }, Teams: { key: "teams", Editor: TeamsEditor },
  Courses: { key: "courses", Editor: CoursesEditor }, Rounds: { key: "rounds", Editor: RoundsEditor }, Schedule: { key: "schedule", Editor: ScheduleEditor },
  Rules: { key: "rules", Editor: RulesEditor }, Branding: { key: "branding", Editor: BrandingEditor }, Website: { key: "website", Editor: WebsiteEditor },
  Media: { key: "media", Editor: MediaEditor },
};

/**
 * The saved Tournament Dashboard (COMPLETE → PUBLISH). Each section saves on
 * its own through the server, which re-validates it, stores it, and returns
 * the fresh setup plus the readiness engine's verdict. This component never
 * decides readiness itself.
 */
export function SavedTournamentDashboard({ initialSetup, initialReadiness, apiBase, readOnlyReason }: {
  initialSetup: TournamentSetup;
  initialReadiness: Readiness;
  apiBase: string;
  readOnlyReason?: string;
}) {
  const [setup, setSetup] = useState(initialSetup);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [open, setOpen] = useState<SectionName | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  useEffect(() => { if (open) editorHeading.current?.focus(); }, [open]);

  async function send(url: string, method: string, body: unknown, done: string) {
    setSaving(true); setErrors([]); setStatus("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        const list: string[] = Array.isArray(result.errors) ? result.errors.map((e: { message: string }) => e.message) : Array.isArray(result.missing) ? result.missing : [];
        setErrors([result.error ?? "Could not save. Try again.", ...list]);
        return;
      }
      setSetup(result.setup); setReadiness(result.readiness); setOpen(null); setStatus(done);
      // Re-render the server parts (the studio bar's name and published state); this component keeps its state.
      router.refresh();
    } catch {
      setErrors(["Could not reach the server. Your changes weren't saved."]);
    } finally {
      setSaving(false);
    }
  }

  const save = (section: SectionKey, name: string) => (data: unknown) => void send(`${apiBase}/sections/${section}`, "PATCH", data, `${name} saved.`);
  const publish = (value: boolean) => void send(`${apiBase}/publish`, "POST", { publish: value }, value ? "Published." : "Unpublished.");
  const openSection = open ? readiness.sections.find((section) => section.name === open) : null;

  return <section className={base.dashboard}>
    <div className={styles.summary}>
      <div className={styles.stageRow}>
        <span className={styles.stage} data-stage={readiness.stage}>{readiness.stage}</span>
        <h2 className={base.muted} style={{ margin: 0, fontSize: 18 }} data-testid="setup-percent">Tournament Setup — {readiness.percent}% Complete</h2>
      </div>
      <progress aria-label="Tournament setup completion" value={readiness.percent} max={100} />
      {readiness.blockedReason && <p className={base.callout}>{readiness.blockedReason}</p>}
      {!readiness.published && readiness.publishMissing.length > 0 && <><p className={styles.missingTitle}>To publish</p><ul className={styles.missing}>{readiness.publishMissing.map((item) => <li key={item}>{item}</li>)}</ul></>}
      {readiness.playMissing.filter((item) => !readiness.publishMissing.includes(item)).length > 0 && <><p className={styles.missingTitle}>Before play</p><ul className={styles.missing}>{readiness.playMissing.filter((item) => !readiness.publishMissing.includes(item)).map((item) => <li key={item}>{item}</li>)}</ul></>}
    </div>
    <p className={styles.saved} role="status" aria-live="polite">{status}</p>
    {readOnlyReason && <p className={base.callout}>{readOnlyReason}</p>}

    {open && openSection && <div className={styles.editor}>
      <h3 ref={editorHeading} tabIndex={-1}>{open}</h3>
      {errors.length > 0 && <div className={base.errors} role="alert"><strong>{errors[0]}</strong>{errors.length > 1 && <ul>{errors.slice(1).map((error) => <li key={error}>{error}</li>)}</ul>}</div>}
      {open === "Publish" ? <PublishPanel readiness={readiness} setup={setup} saving={saving} onPublish={publish} onCancel={() => setOpen(null)} />
        : (() => { const { key, Editor } = EDITORS[open]; return <Editor setup={setup} saving={saving} onSave={save(key, open)} onCancel={() => { setOpen(null); setErrors([]); }} />; })()}
    </div>}

    <div className={base.cards}>{readiness.sections.map((section) =>
      <article className={base.card} key={section.name} data-section={section.name}>
        <div className={base.cardTop}><h3>{section.name}</h3>
          <span className={`${base.badge} ${section.status === "Ready" ? styles.readyBadge : ""}`} data-status={section.status}>{section.status === "Locked" && <LockKeyhole size={12} aria-hidden="true" />}{section.status}</span>
        </div>
        <p>{section.detail}</p>
        {!readOnlyReason && <button className={base.textButton} onClick={() => { setOpen(section.name); setErrors([]); }}>{section.name === "Publish" ? "Open publishing" : `Edit ${section.name.toLowerCase()}`}</button>}
      </article>)}
    </div>
  </section>;
}

function PublishPanel({ readiness, setup, saving, onPublish, onCancel }: { readiness: Readiness; setup: TournamentSetup; saving: boolean; onPublish: (publish: boolean) => void; onCancel: () => void }) {
  const address = `/t/${setup.tournament.slug}/${setup.edition.seasonYear}`;
  return <div className={base.fields}>
    {readiness.published
      ? <p>Published {setup.edition.publishedAt?.slice(0, 10)}. The site will live at {address} ({setup.tournament.visibility}).</p>
      : readiness.publishReady
        ? <p>Everything a public site needs is set. Publishing makes the tournament {setup.tournament.visibility} at {address}.</p>
        : <p>Finish these first:</p>}
    {!readiness.published && !readiness.publishReady && <ul className={styles.missing}>{readiness.publishMissing.map((item) => <li key={item}>{item}</li>)}</ul>}
    <div className={base.actions}>
      <div><button type="button" className={base.secondary} onClick={onCancel} disabled={saving}>Close</button></div>
      {readiness.published
        ? <button type="button" className={base.secondary} disabled={saving} onClick={() => onPublish(false)}>Unpublish</button>
        : <button type="button" className={base.primary} disabled={saving || !readiness.publishReady} onClick={() => onPublish(true)}>Publish tournament</button>}
    </div>
  </div>;
}
