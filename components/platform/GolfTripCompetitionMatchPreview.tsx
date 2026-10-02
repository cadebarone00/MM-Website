"use client";

import { useState } from "react";
import { GOLF_MATCH_PREVIEWS, type GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { GolfMatchup, GolfTripMatch, GolfTripLeaderboard } from "./GolfTripMatch";
import styles from "./GolfTripCompetitionMatchPreview.module.css";

/** Fictional presentation samples only; selecting a format never edits round settings. */
export function GolfTripCompetitionMatchPreview({ initialMatch }: { initialMatch: GolfMatchPreview }) {
  const [selected, setSelected] = useState<string | null>(null);
  const match = selected ? GOLF_MATCH_PREVIEWS[selected] : initialMatch;
  const current = selected ?? Object.keys(GOLF_MATCH_PREVIEWS).find(key => GOLF_MATCH_PREVIEWS[key].format === initialMatch.format) ?? "singles";
  const matchPlay = match.formatDef?.scoringMethod === "match_play";
  return <div className={styles.preview}>
    <label className={styles.selector}>Format preview
      <select value={current} onChange={event => setSelected(event.target.value)}>
        {Object.entries(GOLF_MATCH_PREVIEWS).map(([key, sample]) => <option key={key} value={key}>{sample.formatDef?.label ?? sample.format}</option>)}
      </select>
    </label>
    <p className={styles.note}>Fictional preview only. Format selection does not change competition settings or calculate scores.</p>
    <p className={styles.description}>{match.formatDef?.description}</p>
    <div key={current} className={styles.sample}>
      {matchPlay ? <><GolfMatchup match={match} showDots={false} /><GolfTripMatch match={match} /></> : <GolfTripLeaderboard match={match} />}
    </div>
  </div>;
}
