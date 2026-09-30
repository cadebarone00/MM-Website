import Link from "next/link";
import { ChevronRight, Flag, Plus } from "lucide-react";
import { formatDateRange } from "@/lib/platform/publicSite";
import { loadMyPastTournaments } from "@/lib/platform/pastTournamentsServer";
import { JoinLinkForm } from "./JoinLinkForm";
import { PlatformHeader } from "./PlatformHeader";
import styles from "./JoinTournament.module.css";

/**
 * Join Tournament (/tournaments/join): open a tournament from its link,
 * start a new one, or revisit the finished tournaments you played in.
 */
export async function JoinTournamentPage() {
  const past = await loadMyPastTournaments();

  return <>
    <PlatformHeader />
    <main className={styles.page}>
      <h1 className={styles.title}>Tournaments</h1>
      <JoinLinkForm />
      <Link href="/tournaments/new" className={styles.create}><Plus size={18} aria-hidden="true" />Create Tournament</Link>

      <section aria-labelledby="past-heading" className={styles.past}>
        <h2 id="past-heading">Past Tournaments</h2>
        {!past.signedIn ? <p className={styles.note}><Link href="/login">Log in</Link> to see your past tournaments.</p>
          : !past.ok ? <p className={styles.note} role="alert">We couldn&apos;t load your past tournaments right now. Refresh the page to try again.</p>
          : past.tournaments.length === 0 ? <p className={styles.note}>No past tournaments yet.</p>
          : <ul className={styles.list}>{past.tournaments.map((t) =>
            <li key={`${t.href}-${t.year}`}>
              <Link href={t.href} className={styles.row}>
                <span className={styles.badge} aria-hidden="true"><Flag size={20} /></span>
                <span className={styles.rowText}>
                  <strong>{t.name}</strong>
                  <span>{[String(t.year), t.destination].filter(Boolean).join(" • ")}</span>
                  {t.startDate && <span className={styles.dates}>{formatDateRange(t.startDate, t.endDate)}</span>}
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            </li>)}
          </ul>}
      </section>
    </main>
  </>;
}
