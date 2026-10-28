import { withReturnTo } from "@/lib/auth/returnTo";
import type { OAuthProvider } from "@/lib/auth/oauth";
import Link from "next/link";
import { SocialSignIn } from "./SocialSignIn";
import styles from "./LoginWelcome.module.css";

export function LoginWelcome({ returnTo = null, providers = [], error = null }: { returnTo?: string | null; providers?: OAuthProvider[]; error?: string | null }) {
  return <main className={styles.page}>
    <section className={styles.welcome} aria-labelledby="welcome-title">
      <h1 id="welcome-title" className={styles.title}>The Maroon</h1>
      <div className={styles.actions}>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <Link href={withReturnTo("/login/email", returnTo)} className={styles.signIn}>Sign in</Link>
        <span className={styles.or}>or</span>
        <Link href={withReturnTo("/signup", returnTo)} className={styles.create}>Create an Account</Link>
        {providers.length > 0 && <><span className={styles.or}>or</span><SocialSignIn providers={providers} returnTo={returnTo} /></>}
      </div>
    </section>
  </main>;
}
