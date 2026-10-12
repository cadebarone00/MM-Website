import type { ReactNode } from "react";
import styles from "./CreateTournament.module.css";

/**
 * The create / questionnaire layout (same look as Create Tournament, page 1): no header, cream up top
 * holding `top` (title, step), and the maroon sheet rising from the bottom holding the controls.
 */
/** `tall`: a taller dark sheet, for a step with more fields (Trip Basics). */
export function SetupSheet({ top, label, children, tall = false }: { top?: ReactNode; label: string; children: ReactNode; tall?: boolean }) {
  return <main className={styles.split}>
    <section className={`${styles.cream} ${styles.creamIntro}`}>{top}</section>
    <section className={`${styles.picker} ${tall ? styles.pickerTall : ""}`} aria-label={label}>{children}</section>
  </main>;
}
