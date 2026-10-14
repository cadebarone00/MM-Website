"use client";

import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { GolfTripMatch } from "./GolfTripMatch";
import styles from "./GolfTripCompetitionMatchPreview.module.css";

/** The Competition section: every round's matches (the list opens on the current round, with < > to past / future
 *  rounds; the current round's matchup card sits in the top box). A round with no matches set shows the same list
 *  with a placeholder match. Development controls live in the simulator. */
export function GolfTripCompetitionMatchPreview({ initialMatch: match, viewRound, roundStarted, draftScope }: { initialMatch: GolfMatchPreview; viewRound?: number; roundStarted?: boolean; draftScope?: string }) {
  return <div className={styles.preview}>
    <div key={match.format} className={styles.sample}>
      <GolfTripMatch match={match} viewRound={viewRound} roundStarted={roundStarted} draftScope={draftScope} />
    </div>
  </div>;
}
