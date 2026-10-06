import Link from "next/link";
import styles from "./LoginWelcome.module.css";

export function LoginWelcome() {
  return <main className={styles.page}>
    <section className={styles.welcome} aria-labelledby="welcome-title">
      <h1 id="welcome-title" className={styles.title}>The Maroon</h1>
      <div className={styles.actions}>
        <Link href="/login/email" className={styles.signIn}>Sign in</Link>
        <span className={styles.or}>or</span>
        <Link href="/signup" className={styles.create}>Create an Account</Link>
      </div>
    </section>
  </main>;
}
