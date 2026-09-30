import type { ReactNode } from "react";
import Link from "next/link";
import { LayoutList, Plus } from "lucide-react";
import { AccountBadge } from "@/components/AccountBadge";
import { Wordmark } from "@/components/Wordmark";
import { publicBasePath } from "@/lib/platform/publicSite";
import styles from "./OrganizerStudio.module.css";

/** The tournament being managed, as the studio bar shows it. */
export interface StudioTournament {
  name: string;
  slug: string;
  year: number;
  published: boolean;
  /** false for The Maroon Tournament, which is managed in the Admin Center and has no /t site. */
  previewable: boolean;
}

type StudioPage = "home" | "create" | "setup" | "preview";

/**
 * The neutral organizer studio for commercial tournament management
 * (/tournaments/**). It carries the platform's name and the organizer's own
 * account, never another tournament's chrome: no champions ribbon, countdown,
 * Maroon-vs-White or Maroon Tournament navigation (SiteChrome leaves these
 * routes bare). Access is decided by each page before this renders.
 */
export function OrganizerStudioShell({ page, tournament, children }: { page: StudioPage; tournament?: StudioTournament; children: ReactNode }) {
  return <div className={styles.studio}>
    <header className={styles.header} data-page={page}>
      <div className={styles.bar}>
        <p className={styles.brand}><Wordmark className={styles.wordmark} /><span className={styles.label}>Tournament Studio</span></p>
        <div className={styles.account}>
          <Link className={styles.create} href="/tournaments" aria-label="My Tournaments" aria-current={page === "home" ? "page" : undefined}><LayoutList size={16} aria-hidden="true" /><span>My Tournaments</span></Link>
          {page !== "create" && <Link className={styles.create} href="/tournaments/new" aria-label="Create Tournament"><Plus size={16} aria-hidden="true" /><span>Create Tournament</span></Link>}
          <AccountBadge position="header" />
        </div>
      </div>
      {tournament && <StudioTournamentBar page={page} tournament={tournament} />}
    </header>
    {children}
  </div>;
}

/** Current tournament + its studio navigation: Setup, Preview Website, Public Site (once published). */
export function StudioTournamentBar({ page, tournament }: { page: StudioPage; tournament: StudioTournament }) {
  const base = `/tournaments/${encodeURIComponent(tournament.slug)}/${tournament.year}`;
  const current = (name: StudioPage) => (page === name ? "page" : undefined);
  return <div className={styles.context}>
    <p className={styles.name}>
      <span>{tournament.name} {tournament.year}</span>
      {tournament.previewable && <span className={styles.status} data-published={tournament.published}>{tournament.published ? "Published" : "Not published"}</span>}
    </p>
    <nav className={styles.tabs} aria-label="Tournament studio">
      <Link href={base} aria-current={current("setup")}>Setup</Link>
      {tournament.previewable && <Link href={`${base}/preview`} aria-current={current("preview")}>Preview Website</Link>}
      {tournament.previewable && tournament.published && <a href={publicBasePath(tournament.slug, tournament.year)} target="_blank" rel="noopener">Public Site</a>}
    </nav>
  </div>;
}
