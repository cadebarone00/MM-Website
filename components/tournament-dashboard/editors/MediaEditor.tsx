"use client";

import { useState } from "react";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";
import { hasEntitlement } from "@/lib/platform/entitlements";
import type { MediaMode } from "@/lib/platform/setup";
import styles from "../TournamentDashboard.module.css";
import { EditorActions, Field, type EditorProps } from "../editorKit";

export function MediaEditor({ setup, saving, onSave, onCancel }: EditorProps) {
  const [mode, setMode] = useState<MediaMode>(setup.media.mode);
  const [links, setLinks] = useState(setup.media.links);
  const hosted = hasEntitlement(setup.entitlements, "hosted_media");
  const option = (value: MediaMode, title: string, text: string, disabled = false) =>
    <label className={styles.radio} data-disabled={disabled}>
      <input type="radio" name="media-mode" value={value} checked={mode === value} disabled={disabled} onChange={() => setMode(value)} />
      <span><strong>{title}</strong><br /><span className={base.muted}>{text}</span></span>
    </label>;
  return <form onSubmit={(event) => { event.preventDefault(); onSave({ mode, links }); }} noValidate>
    <div className={base.fields}>
      <p className={base.muted}>Optional, and never required to publish or play.</p>
      {option("none", "No media", "Players keep photos and videos on their own phones.")}
      {option("device_external", "Linked media", "Link highlights and photos hosted elsewhere, like YouTube or a shared album.")}
      {option("maroon_hosted", "Hosted by The Maroon", hosted ? "Uploads stored by The Maroon." : "Reserved for The Maroon. Not included for this tournament.", !hosted)}
      {mode === "device_external" && <>
        <div className={styles.rows}>{links.map((link, index) =>
          <div className={`${styles.row} ${styles.row3}`} key={index}>
            <Field label="Name"><input value={link.label} maxLength={60} onChange={(event) => setLinks(links.map((l, i) => (i === index ? { ...l, label: event.target.value } : l)))} /></Field>
            <Field label="Link (https://)"><input type="url" value={link.url} onChange={(event) => setLinks(links.map((l, i) => (i === index ? { ...l, url: event.target.value } : l)))} /></Field>
            <span />
            <button type="button" className={styles.removeButton} onClick={() => setLinks(links.filter((_, i) => i !== index))} aria-label={`Remove link ${index + 1}`}>Remove</button>
          </div>)}
        </div>
        {links.length < 10 && <button type="button" className={base.textButton} onClick={() => setLinks([...links, { label: "", url: "" }])}>+ Add a link</button>}
      </>}
    </div>
    <EditorActions saving={saving} onCancel={onCancel} />
  </form>;
}
