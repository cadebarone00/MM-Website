import Link from "next/link";
import { Menu, UserRound } from "lucide-react";
import styles from "./PlatformEntry.module.css";

export function PlatformHeader({ home = false }: { home?: boolean }) {
  return <header className={`${styles.header} ${home ? styles.homeHeader : ""}`}>
    <div className={styles.headerInner}>
      <details className={styles.menu}>
        <summary aria-label="Open navigation"><Menu size={22} aria-hidden="true" /></summary>
        <nav aria-label="Platform navigation">
          <Link href="/">Home</Link>
          <Link href="/tournaments">My Tournaments</Link>
          <Link href="/tournaments/new">Create Tournament</Link>
          <Link href="/">Explore The Maroon</Link>
          <Link href="/website">The Maroon Tournament</Link>
          <Link href="/contact">Contact Us</Link>
        </nav>
      </details>
      <Link href="/" className={styles.wordmark}>The Maroon</Link>
      <Link href="/account/choose" className={styles.account} aria-label="Your account"><UserRound size={22} aria-hidden="true" /></Link>
    </div>
  </header>;
}
