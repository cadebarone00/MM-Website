import Link from "next/link";
import { ChevronRight } from "lucide-react";
import styles from "@/components/platform/League.module.css";
import playStyles from "@/components/platform/PlayRound.module.css";

/** DEV ONLY (/dev/samples): one sample of each way to play, on the website and in the app. Nothing in them is saved. */
const SAMPLES = [
  { href: "/dev/round", letter: "P", title: "Play", note: "A round with friends: 4 players, Skins, the scorecard and invite code" },
  { href: "/dev/tournament", letter: "T", title: "Golf Trip", note: "The 2026 Maroon trip in Palm Springs: Home, Golf, Venue, Itinerary" },
  { href: "/dev/tourney", letter: "C", title: "Tourney", note: "A code tournament: 8 players, leaderboard, tee sheet and your card" },
  { href: "/dev/leagues", letter: "L", title: "League", note: "Thursday Night League: leaderboard, skins, pairs, group games, tee times" },
];

export function DevSamples() {
  return <main className={playStyles.page}>
    <section className={playStyles.panel}>
      <p className={playStyles.kicker}>Preview only · nothing saved</p>
      <h1 className={playStyles.title}>Samples</h1>
      <ul className={styles.leagueList}>{SAMPLES.map((s) => <li key={s.href}><Link href={s.href}>
        <span className={styles.sampleRow}><b className={styles.sampleLetter}>{s.letter}</b><span><strong>{s.title}</strong><small>{s.note}</small></span></span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link></li>)}</ul>
    </section>
  </main>;
}
