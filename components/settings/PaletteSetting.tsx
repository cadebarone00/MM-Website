"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { APP_PALETTES, applyPalette, type AppPalette } from "@/lib/theme/appPalette";
import styles from "./Settings.module.css";

/**
 * Settings → App colour: a swatch per palette. Tapping one recolours the whole app straight away (html[data-palette])
 * and keeps it on this device for a year (the "palette" cookie, read by the server on every page).
 */
export function PaletteSetting({ initial }: { initial: AppPalette }) {
  const [palette, setPalette] = useState(initial);
  function choose(next: AppPalette) {
    setPalette(next);
    applyPalette(next);
  }
  return <>
    <h2 id="settings-palette" className={styles.cardTitle}>App colour</h2>
    <p className={`${styles.text} ${styles.muted}`}>Pick the colour the app uses everywhere. Saved on this device.</p>
    <div className={styles.palettes} role="radiogroup" aria-labelledby="settings-palette">
      {APP_PALETTES.map((p) => <button key={p.id} type="button" role="radio" aria-checked={palette === p.id} className={styles.palette} onClick={() => choose(p.id)}>
        <span className={styles.paletteSwatch} style={{ background: p.swatch }}>{palette === p.id && <Check size={18} aria-hidden="true" />}</span>
        <span>{p.name}</span>
      </button>)}
    </div>
  </>;
}
