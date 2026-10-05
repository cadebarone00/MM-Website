import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Welcome | The Maroon" };

export default function NewUserPage() {
  return <main className={styles.page}>
    <section className={styles.welcome} aria-labelledby="welcome-title">
      <h1 id="welcome-title" className={styles.title}>The Maroon</h1>
      <div className={styles.actions}>
        <Link href="/login" className={styles.signIn}>Sign in</Link>
        <span className={styles.or}>or</span>
        <Link href="/signup" className={styles.create}>Create an Account</Link>
      </div>
    </section>
  </main>;
}
