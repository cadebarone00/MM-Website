import type { ReactNode } from "react";
import styles from "./CreateTournament.module.css";
import { TRIP_BUILDER_STEPS } from "@/lib/platform/tripBuilderSteps";

/** The Golf Trip wizard's steps in order (the progress line fills as these are completed). */
export const TRIP_WIZARD_STEPS = TRIP_BUILDER_STEPS;

/**
 * The create / questionnaire layout (same look as Create Tournament, page 1): no header, cream up top
 * holding `top` (title, step), and the maroon sheet rising from the bottom holding the controls.
 *
 * `wizardStep` (Golf Trip creation): the trip wizard look instead, laid out like the sign-up screens (owner request
 * 2026-11-20): a maroon page with the progress line, the step's title, the step, then Next and Back right under it,
 * all at the top so the phone keyboard has room underneath. No animation. 1-8 = TRIP_WIZARD_STEPS.
 */
/** `tall`: a taller dark sheet, for a step with more fields (Trip Basics). */
export function SetupSheet({ top, label, children, tall = false, wizardStep }: { top?: ReactNode; label: string; children: ReactNode; tall?: boolean; wizardStep?: number }) {
  if (wizardStep !== undefined) {
    const done = Math.max(0, Math.min(1, wizardStep / TRIP_WIZARD_STEPS.length));
    return <main className={styles.wizard}>
      <section className={styles.wizardBody} aria-label={label}>
        <div className={styles.wizardProgress} aria-hidden="true"><span style={{ width: `${done * 100}%` }} /></div>
        <h1 className={styles.wizardTitle}>{label}</h1>
        {children}
      </section>
    </main>;
  }
  return <main className={styles.split}>
    <section className={`${styles.cream} ${styles.creamIntro}`}>{top}</section>
    <section className={`${styles.picker} ${tall ? styles.pickerTall : ""}`} aria-label={label}>{children}</section>
  </main>;
}
