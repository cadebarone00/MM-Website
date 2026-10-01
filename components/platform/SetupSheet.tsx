import type { ReactNode } from "react";
import styles from "./CreateTournament.module.css";

/**
 * The create / questionnaire layout (same look as Create Tournament, page 1): no header, cream up top
 * holding `top` (title, step), and the maroon sheet rising from the bottom holding the controls.
 */
export function SetupSheet({ top, label, children }: { top?: ReactNode; label: string; children: ReactNode }) {
  return <main className={styles.split}>
    <section className={`${styles.cream} ${styles.creamIntro}`}>{top}</section>
    <section className={styles.picker} aria-label={label}>{children}</section>
  </main>;
}
