"use client";

import { useState } from "react";
import { LIVE_VISIBILITIES, LIVE_VISIBILITY_COPY, type LiveSettings } from "@/lib/platform/liveVisibility";
import styles from "./CodeTournament.module.css";

/**
 * The Maroon Live (project_specs.md, Step 1): the organizer picks Public / Link only / Private and whether players
 * can share the link. Each tap saves right away; `onChange` resolves false when it couldn't save (the parent says why).
 */
export function LiveVisibilityPicker({ settings, onChange }: { settings: LiveSettings; onChange: (next: LiveSettings) => Promise<boolean> }) {
  const [shown, setShown] = useState(settings);
  const [busy, setBusy] = useState(false);
  async function save(next: LiveSettings) {
    if (next.visibility === shown.visibility && next.playersCanShare === shown.playersCanShare) return;
    const before = shown;
    setShown(next); setBusy(true);
    if (!await onChange(next)) setShown(before);
    setBusy(false);
  }
  return <section className={`${styles.settingsPanel} ${styles.cutEditor}`} aria-label="Who can watch">
    <div className={styles.cutChoices} role="group" aria-label="Who can watch the live site">
      {LIVE_VISIBILITIES.map((value) => <button key={value} type="button" aria-pressed={shown.visibility === value} disabled={busy}
        onClick={() => void save({ ...shown, visibility: value })}>{LIVE_VISIBILITY_COPY[value].label}</button>)}
    </div>
    <p className={styles.cutBlurb}>{LIVE_VISIBILITY_COPY[shown.visibility].detail}{shown.visibility !== "private" && " Only the golf shows: leaderboards, matches and scorecards."}</p>
    {shown.visibility !== "private" && <>
      <p className={styles.cutBlurb}><b>Players can share the link</b></p>
      <div className={styles.cutChoices} role="group" aria-label="Players can share the link">
        {([[true, "Yes"], [false, "No, only organizers"]] as const).map(([value, label]) => <button key={label} type="button" aria-pressed={shown.playersCanShare === value} disabled={busy}
          onClick={() => void save({ ...shown, playersCanShare: value })}>{label}</button>)}
      </div>
    </>}
  </section>;
}
