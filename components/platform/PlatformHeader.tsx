import Link from "next/link";
import { Menu, UserRound } from "lucide-react";
import { SignInRequiredLink } from "./SignInRequiredLink";
import styles from "./PlatformEntry.module.css";

/** Page titles share the navigation row, immediately beside the menu. */
export function PlatformHeader({ home = false, wordmark = true, title }: { home?: boolean; wordmark?: boolean; title?: string }) {
  return <header className={`${styles.header} ${home ? styles.homeHeader : ""}`}>
    <div className={styles.headerInner}>
      <details className={styles.menu}>
        <summary aria-label="Open navigation"><Menu size={22} aria-hidden="true" /></summary>
        <nav aria-label="Platform navigation">
          <Link href="/">Home</Link>
          <Link href="/golf-trips">Golf Trips</Link>
          <Link href="/tournaments/mine">My Tournaments</Link>
          <SignInRequiredLink href="/tournaments/create" message="Sign in to create a tournament">Create Tournament</SignInRequiredLink>
          <Link href="/">Explore The Maroon</Link>
          <Link href="/contact">Contact Us</Link>
        </nav>
      </details>
      {title ? <h1 className={styles.pageTitle}>{title}</h1> : wordmark ? <Link href="/" className={styles.wordmark}>The Maroon</Link> : <span aria-hidden="true" />}
      <Link href="/profile" className={styles.account} aria-label="Your account"><UserRound size={22} aria-hidden="true" /></Link>
    </div>
  </header>;
}
