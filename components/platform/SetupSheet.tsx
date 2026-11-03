import type { ReactNode } from "react";
import styles from "./CreateTournament.module.css";
import { TripWizardArt } from "./TripWizardArt";

/** The Golf Trip wizard's steps in order (the cream animation and the progress line fill as these are completed). */
export const TRIP_WIZARD_STEPS = ["Trip Basics", "Golf", "Courses", "Format", "Lodging", "Flights", "Transportation", "Review"] as const;

/**
 * The create / questionnaire layout (same look as Create Tournament, page 1): no header, cream up top
 * holding `top` (title, step), and the maroon sheet rising from the bottom holding the controls.
 *
 * `wizardStep` (Golf Trip creation, owner request 2026-11-02): the trip wizard look instead, styled like the sign-up
 * screens: the top 30% is cream and holds the trip animation (it moves closer to done with every step), and the maroon
 * below has the progress line, the step's title and the step itself, with Back / Next at the bottom. 0 = the intro
 * screen before Trip Basics; 1-8 = TRIP_WIZARD_STEPS.
 */
/** `tall`: a taller dark sheet, for a step with more fields (Trip Basics). */
export function SetupSheet({ top, label, children, tall = false, wizardStep }: { top?: ReactNode; label: string; children: ReactNode; tall?: boolean; wizardStep?: number }) {
  if (wizardStep !== undefined) {
    const done = Math.max(0, Math.min(1, wizardStep / TRIP_WIZARD_STEPS.length));
    const before = Math.max(0, Math.min(1, (wizardStep - 1) / TRIP_WIZARD_STEPS.length));
    return <main className={styles.wizard}>
      <section className={styles.wizardArt} aria-hidden="true"><TripWizardArt from={before} to={done} /></section>
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
