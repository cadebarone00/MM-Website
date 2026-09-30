import type { ReactNode } from "react";
import styles from "./AuthLayout.module.css";
export function AuthLayout({ children }: { children: ReactNode }) {
  return <main className={styles.layout}><section aria-label="Your account" className={styles.panel}>{children}</section></main>;
}
