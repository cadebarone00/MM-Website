import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { loadMyPlayingTournaments } from "@/lib/platform/pastTournamentsServer";
import { TournamentRows } from "./JoinTournamentPage";
import { PlatformHeader } from "./PlatformHeader";
import styles from "./JoinTournament.module.css";

/**
 * My Tournaments (/tournaments/mine), opened from the Tourneys page: the
 * current and upcoming tournaments you're playing in. Tapping one enters its
 * Tournament Home. (The organizer studio's list is the separate /tournaments.)
 */
export async function MyPlayingTournamentsPage() {
  const mine = await loadMyPlayingTournaments();

  return <>
    <PlatformHeader />
    <main className={styles.page}>
      <Link href="/tournaments/join" className={styles.back}><ChevronLeft size={16} aria-hidden="true" />Tournaments</Link>
      <h1 className={styles.heading}>My Tournaments</h1>
      {!mine.signedIn ? <p className={styles.note}><Link href="/login">Log in</Link> to see your tournaments.</p>
        : !mine.ok ? <p className={styles.note} role="alert">We couldn&apos;t load your tournaments right now. Refresh the page to try again.</p>
        : mine.tournaments.length === 0 ? <p className={styles.note}>You&apos;re not in any upcoming tournaments yet.</p>
        : <TournamentRows tournaments={mine.tournaments} />}
    </main>
  </>;
}
