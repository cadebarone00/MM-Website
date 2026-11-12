"use client";

import type { ReactNode } from "react";
import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { golfDayAssignment, golfDayMatchNames, golfDayRounds, golfDaySummary } from "@/lib/platform/golfDay";
import type { GolfTripDraft } from "@/lib/platform/golfTripDraft";
import type { CompetitionStructure } from "@/lib/platform/golfTripNavigation";
import styles from "./GolfDayBoard.module.css";

export function GolfDayBoard({ match, schedule, viewerName, structure, spectator, sittingOut, roundRsvps, children }: {
  match?: GolfMatchPreview; schedule?: GolfTripDraft; viewerName?: string | null; structure: CompetitionStructure;
  spectator?: boolean; sittingOut?: boolean; roundRsvps?: Record<number, Record<string, string>>; children: ReactNode;
}) {
  const rounds = golfDayRounds(match, schedule);
  const summary = golfDaySummary(match, viewerName, structure, spectator);
  return <section className={styles.board} aria-label={spectator ? "Golf day overview" : "Your golf day"}>
    <div className={styles.content}>
      {summary && <dl className={styles.summary} aria-label="Your trip standings">
        <div><dt>Trip +/−</dt><dd>{summary.total}</dd></div>
        <div><dt>Position</dt><dd>{summary.position}</dd></div>
        {structure.team && <div><dt>Points earned</dt><dd>{summary.points ?? "—"}</dd></div>}
      </dl>}
      {rounds.length ? rounds.map(round => {
        const { player, ownSide } = golfDayAssignment(round, viewerName, spectator);
        const out = roundRsvps?.[round.round]?.[viewerName ?? ""] === "out" || (round.round === match?.round && sittingOut);
        return <div className={styles.round} key={round.round} aria-label={`Round ${round.round} overview`}>
          <div className={styles.course}><h3>{player?.course || round.course || "Course not set"}</h3><p>{round.format || "Format not set"}</p></div>
          <div className={styles.assignment}><p className={styles.tee}>{spectator ? "See tee sheet" : out ? "Sitting out" : player?.teeTime || ownSide?.teeTime || "Tee time not set"}</p><p className={styles.match}>{spectator ? "Team leaderboard" : out ? "Sitting out this round" : golfDayMatchNames(round, viewerName)}</p></div>
        </div>;
      }) : <p className={styles.empty}>Round not set</p>}
    </div>
    <div className={styles.navigation}>{children}</div>
  </section>;
}

