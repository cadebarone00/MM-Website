import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, Home, ListOrdered, MoreHorizontal, Swords, Users } from "lucide-react";
import { readableText, safeColor } from "@/components/platform/tournament-site/theme";
import type { TournamentSiteData } from "@/components/platform/tournament-site/types";
import { PLAY_TAB_LABELS, PLAY_TABS, playPath, type PlayTab } from "@/lib/platform/tournamentHome";
import styles from "./Play.module.css";

const ICONS: Record<PlayTab, typeof Home> = { home: Home, matches: Swords, leaderboard: ListOrdered, players: Users, more: MoreHorizontal };

/**
 * The logged-in tournament app frame: a compact top bar, the screen, and the
 * Home · Matches · Leaderboard · Players · More bottom navigation. The
 * tournament's own accent color tints highlights; the environment stays
 * The Maroon's deep maroon.
 */
export function PlayShell({ slug, year, site, tab, children }: { slug: string; year: number; site: TournamentSiteData; tab: PlayTab; children: ReactNode }) {
  const accent = safeColor(site.branding.accent, "#d6b85c");
  const primary = safeColor(site.branding.primary, "#500001");
  const theme = { "--play-accent": accent, "--play-on-accent": readableText(accent), "--play-brand": primary } as CSSProperties;
  return <div className={styles.app} style={theme}>
    <header className={styles.topBar}>
      <Link href="/tournaments/join" className={styles.iconButton} aria-label="All tournaments"><ChevronLeft size={24} aria-hidden="true" /></Link>
      <p className={styles.topTitle}>{site.branding.shortName} <span>{year}</span></p>
      <span className={styles.iconButton} aria-hidden="true" />
    </header>
    <main className={styles.screen} id="play-content">{children}</main>
    <nav className={styles.bottomNav} aria-label="Tournament">
      {PLAY_TABS.map((key) => {
        const Icon = ICONS[key];
        return <Link key={key} href={playPath(slug, year, key)} className={styles.navItem} aria-current={key === tab ? "page" : undefined}>
          <Icon size={22} aria-hidden="true" /><span>{PLAY_TAB_LABELS[key]}</span>
        </Link>;
      })}
    </nav>
  </div>;
}

/** Small section heading used on every tab. */
export function PlaySection({ title, action, children, id }: { title: string; action?: ReactNode; children: ReactNode; id?: string }) {
  const headingId = id ?? `play-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return <section className={styles.section} aria-labelledby={headingId}>
    <div className={styles.sectionHead}><h2 id={headingId}>{title}</h2>{action}</div>
    {children}
  </section>;
}

/** A deliberate "not yet" state (pre-live-scoring data, empty lists). */
export function Holding({ title, children }: { title: string; children?: ReactNode }) {
  return <div className={styles.holding}><p className={styles.holdingTitle}>{title}</p>{children && <p>{children}</p>}</div>;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}
