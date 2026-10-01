import Link from "next/link";
import { Menu, UserRound } from "lucide-react";
import styles from "./PlatformEntry.module.css";

/** `wordmark={false}`: just the menu and account icons; the page shows its own big title. */
export function PlatformHeader({ home = false, wordmark = true }: { home?: boolean; wordmark?: boolean }) {
  return <header className={`${styles.header} ${home ? styles.homeHeader : ""}`}>
    <div className={styles.headerInner}>
      <details className={styles.menu}>
        <summary aria-label="Open navigation"><Menu size={22} aria-hidden="true" /></summary>
        <nav aria-label="Platform navigation">
          <Link href="/">Home</Link>
          <Link href="/tournaments/mine">My Tournaments</Link>
          <Link href="/tournaments/create">Create Tournament</Link>
          <Link href="/">Explore The Maroon</Link>
          <Link href="/contact">Contact Us</Link>
        </nav>
      </details>
      {wordmark ? <Link href="/" className={styles.wordmark}>The Maroon</Link> : <span aria-hidden="true" />}
      <Link href="/profile" className={styles.account} aria-label="Your account"><UserRound size={22} aria-hidden="true" /></Link>
    </div>
  </header>;
}
