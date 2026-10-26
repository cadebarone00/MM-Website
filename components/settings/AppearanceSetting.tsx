"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyMode, type AppMode } from "@/lib/theme/appMode";
import styles from "./Settings.module.css";

/** Settings → Dark mode: one switch. On = the maroon app (Dark), off = Light (white). Switches straight away; saved on this device. */
export function AppearanceSetting({ initial }: { initial: AppMode }) {
  const [mode, setMode] = useState(initial);
  const dark = mode === "dark";
  const toggle = () => { const next: AppMode = dark ? "light" : "dark"; setMode(next); applyMode(next); };
  return <div className={styles.modeRow}>
    <span className={styles.modeIcon} aria-hidden="true">{dark ? <Moon size={18} /> : <Sun size={18} />}</span>
    <span id="settings-appearance" className={styles.modeLabel}>Dark mode</span>
    <button type="button" role="switch" aria-checked={dark} aria-labelledby="settings-appearance" className={styles.switch} onClick={toggle}>
      <span className={styles.switchKnob} />
    </button>
  </div>;
}
