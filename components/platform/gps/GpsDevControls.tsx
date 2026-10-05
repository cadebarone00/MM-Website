import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw } from "lucide-react";
import type { GpsMode, PlayerFix } from "@/lib/platform/golfGps/types";
import { MOCK_STEP_YARDS } from "@/lib/platform/golfGps/usePlayerLocation";
import styles from "./GolfGps.module.css";

/**
 * DEV ONLY: Real / Mock GPS switch, arrows that walk the mock player 10 yards north / south / east / west, Reset (back
 * to the tee), and the current GPS accuracy.
 */
export function GpsDevControls({ mode, onMode, fix, onMove, onReset }: {
  mode: GpsMode;
  onMode: (mode: GpsMode) => void;
  fix: PlayerFix | null;
  /** north / east in steps: (1, 0) = one step north, (0, -1) = one step west. */
  onMove: (north: number, east: number) => void;
  onReset: () => void;
}) {
  const accuracy = fix?.source === "mock" ? "Mock (exact)" : fix?.accuracy != null ? `±${Math.round(fix.accuracy / 0.9144)} yds` : "Waiting…";
  return <section className={styles.dev} aria-label="GPS dev controls">
    <div className={styles.devRow}>
      <div className={styles.devToggle} role="group" aria-label="GPS source">
        {(["real", "mock"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => onMode(value)}>
          {value === "real" ? "Real GPS" : "Mock GPS"}</button>)}
      </div>
      <span className={styles.devAccuracy}>Accuracy <strong>{accuracy}</strong></span>
    </div>
    {mode === "mock" && <div className={styles.devPad} role="group" aria-label={`Move mock player ${MOCK_STEP_YARDS} yards`}>
      <button type="button" className={styles.devUp} aria-label="Move north" onClick={() => onMove(1, 0)}><ArrowUp size={16} aria-hidden /></button>
      <button type="button" className={styles.devLeft} aria-label="Move west" onClick={() => onMove(0, -1)}><ArrowLeft size={16} aria-hidden /></button>
      <button type="button" className={styles.devReset} aria-label="Reset to the tee" onClick={onReset}><RotateCcw size={14} aria-hidden /></button>
      <button type="button" className={styles.devRight} aria-label="Move east" onClick={() => onMove(0, 1)}><ArrowRight size={16} aria-hidden /></button>
      <button type="button" className={styles.devDown} aria-label="Move south" onClick={() => onMove(-1, 0)}><ArrowDown size={16} aria-hidden /></button>
    </div>}
  </section>;
}
