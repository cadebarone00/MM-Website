import Link from "next/link";
import { ChevronRight, Flag, LandPlot } from "lucide-react";
import { LeaderboardIcon } from "@/components/nav/LeaderboardIcon";
import { formatDateRange } from "@/lib/platform/publicSite";
import { loadMyPastTournaments } from "@/lib/platform/pastTournamentsServer";
import type { PastTournament } from "@/lib/platform/pastTournaments";
import { JoinLinkForm } from "./JoinLinkForm";
import { PlatformHeader } from "./PlatformHeader";
import styles from "./JoinTournament.module.css";

/**
 * Tourneys (/tournaments/join): create a tournament, open one from its link,
 * go to My Tournaments, or revisit the finished tournaments you played in.
 */
export async function JoinTournamentPage() {
  const past = await loadMyPastTournaments();

  return <>
    <PlatformHeader wordmark={false} />
    <main className={styles.page}>
      <h1 className={styles.title}>Tourneys</h1>
      <div className={styles.actions}>
        <Link href="/tournaments/create" className={styles.actionBox}><LandPlot size={30} strokeWidth={1.6} aria-hidden="true" />Create a Tournament</Link>
        {/* Not tappable yet — joining is a later round. */}
        <div className={styles.actionBox}><LeaderboardIcon size={30} aria-hidden="true" />Join a Tournament</div>
      </div>
      <Link href="/tournaments/mine" className={styles.myTournaments}>My Tournaments<ChevronRight size={18} aria-hidden="true" /></Link>
      <JoinLinkForm />

      <section aria-labelledby="past-heading" className={styles.past}>
        <h2 id="past-heading">Past Tournaments</h2>
        {!past.signedIn ? <p className={styles.note}><Link href="/login">Log in</Link> to see your past tournaments.</p>
          : !past.ok ? <p className={styles.note} role="alert">We couldn&apos;t load your past tournaments right now. Refresh the page to try again.</p>
          : past.tournaments.length === 0 ? <p className={styles.note}>No past tournaments yet.</p>
          : <TournamentRows tournaments={past.tournaments} />}
      </section>
    </main>
  </>;
}

/**
 * One tappable row per tournament year; shared with My Tournaments, which
 * passes `enter` to add an explicit Enter Tournament button to each card.
 */
export function TournamentRows({ tournaments, enter = false }: { tournaments: PastTournament[]; enter?: boolean }) {
  return <ul className={styles.list}>{tournaments.map((t) =>
    <li key={`${t.href}-${t.year}`} className={enter ? styles.card : undefined}>
      <Link href={t.href} className={styles.row}>
        <span className={styles.badge} aria-hidden="true"><Flag size={20} /></span>
        <span className={styles.rowText}>
          <strong>{t.name} {t.year}</strong>
          {t.destination && <span>{t.destination}</span>}
          {t.startDate && <span className={styles.dates}>{formatDateRange(t.startDate, t.endDate)}</span>}
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
      {enter && <Link href={t.href} className={styles.enter}>
        Enter Tournament<span className={styles.srOnly}> {t.name} {t.year}</span>
      </Link>}
    </li>)}
  </ul>;
}
