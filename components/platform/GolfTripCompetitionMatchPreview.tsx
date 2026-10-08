"use client";

import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { GolfTripMatch, GolfTripLeaderboard } from "./GolfTripMatch";
import styles from "./GolfTripCompetitionMatchPreview.module.css";

/** The Competition section: every round's matches (the list opens on the current round, with < > to past / future
 *  rounds; the current round's matchup card sits in the top box). Formats without matches show the leaderboard.
 *  Development controls live in the simulator. */
export function GolfTripCompetitionMatchPreview({ initialMatch: match, viewRound }: { initialMatch: GolfMatchPreview; viewRound?: number }) {
  // Match play, or real tournament matches (they carry their round) — list them; otherwise the leaderboard.
  const matchPlay = match.formatDef?.scoringMethod === "match_play" || match.matches.some(pairing => pairing.round !== undefined);
  return <div className={styles.preview}>
    <div key={match.format} className={styles.sample}>
      {matchPlay && match.matches.length ? <GolfTripMatch match={match} viewRound={viewRound} /> : <GolfTripLeaderboard match={match} />}
    </div>
  </div>;
}
