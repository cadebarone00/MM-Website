"use client";

import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { GolfMatchup, GolfTripMatch, GolfTripLeaderboard } from "./GolfTripMatch";
import styles from "./GolfTripCompetitionMatchPreview.module.css";

/** Presentation follows the supplied data; development controls live in the simulator. */
export function GolfTripCompetitionMatchPreview({ initialMatch: match }: { initialMatch: GolfMatchPreview }) {
  const matchPlay = match.formatDef?.scoringMethod === "match_play";
  return <div className={styles.preview}>
    <div key={match.format} className={styles.sample}>
      {matchPlay ? <><GolfMatchup match={match} showDots={false} /><GolfTripMatch match={match} /></> : <GolfTripLeaderboard match={match} />}
    </div>
  </div>;
}
