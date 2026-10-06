"use client";

import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { GolfTripMatch, GolfTripLeaderboard } from "./GolfTripMatch";
import styles from "./GolfTripCompetitionMatchPreview.module.css";

/** The Competition section: the matches being played this round (the caller passes only that round's matches; the
 *  matchup card for it sits in the top box). Formats without matches show the leaderboard. Development controls live in
 *  the simulator. */
export function GolfTripCompetitionMatchPreview({ initialMatch: match }: { initialMatch: GolfMatchPreview }) {
  // Match play, or real tournament matches (they carry their round) — list them; otherwise the leaderboard.
  const matchPlay = match.formatDef?.scoringMethod === "match_play" || match.matches.some(pairing => pairing.round !== undefined);
  return <div className={styles.preview}>
    <div key={match.format} className={styles.sample}>
      {matchPlay && match.matches.length ? <GolfTripMatch match={match} /> : <GolfTripLeaderboard match={match} />}
    </div>
  </div>;
}
