"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { APP_MODES, applyMode, type AppMode } from "@/lib/theme/appMode";
import styles from "./Settings.module.css";

/** Settings → Appearance: Dark (maroon) or Light (white). Switches the whole app straight away; saved on this device. */
export function AppearanceSetting({ initial }: { initial: AppMode }) {
  const [mode, setMode] = useState(initial);
  return <>
    <h2 id="settings-appearance" className={styles.cardTitle}>Appearance</h2>
    <div className={styles.modes} role="radiogroup" aria-labelledby="settings-appearance">
      {APP_MODES.map((m) => <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={styles.mode}
        onClick={() => { setMode(m.id); applyMode(m.id); }}>
        <span className={styles.modeSwatch} style={{ background: m.swatch, color: m.ink }}>Aa{mode === m.id && <Check size={16} aria-hidden="true" />}</span>
        <span>{m.name}<small>{m.note}</small></span>
      </button>)}
    </div>
  </>;
}
