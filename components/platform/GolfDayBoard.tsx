"use client";

import { useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { golfDayAssignment, golfDayDateLabel, golfDayMatchNames, golfDayRounds, golfDaySummary } from "@/lib/platform/golfDay";
import type { GolfTripDraft } from "@/lib/platform/golfTripDraft";
import type { CompetitionStructure } from "@/lib/platform/golfTripNavigation";
import styles from "./GolfDayBoard.module.css";
import { shownUsername } from "@/lib/platform/playerUsername";
import { courseOverviewName } from "@/lib/platform/courseShortName";

export function GolfDayBoard({ match, schedule, viewerName, structure, spectator, sittingOut, roundRsvps, children }: {
  match?: GolfMatchPreview; schedule?: GolfTripDraft; viewerName?: string | null; structure: CompetitionStructure;
  spectator?: boolean; sittingOut?: boolean; roundRsvps?: Record<number, Record<string, string>>; children: (handle: ReactNode) => ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const detailsId = useId();
  const drag = useRef<{ id: number; y: number } | null>(null);
  const dragged = useRef(false);
  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    const distance = event.clientY - drag.current.y;
    drag.current = null;
    dragged.current = Math.abs(distance) > 8;
    if (distance < -20) setCollapsed(true);
    if (distance > 20) setCollapsed(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handle = <button type="button" className={styles.handle} aria-label={collapsed ? "Expand golf overview" : "Collapse golf overview"} aria-expanded={!collapsed} aria-controls={detailsId}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        dragged.current = false;
        drag.current = { id: event.pointerId, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={finishDrag}
      onPointerCancel={() => { drag.current = null; dragged.current = false; }}
      onClick={() => { if (dragged.current) { dragged.current = false; return; } setCollapsed(value => !value); }}>
      <span aria-hidden="true" />
    </button>;
  const rounds = golfDayRounds(match, schedule);
  const summary = golfDaySummary(match, viewerName, structure, spectator);
  const viewer = golfDayAssignment(match, viewerName, spectator).player;
  const initials = viewerName?.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase();
  return <section className={styles.board} data-collapsed={collapsed} aria-label={spectator ? "Golf day overview" : "Your golf day"}>
    <div id={detailsId} className={styles.details} data-collapsed={collapsed} inert={collapsed} aria-hidden={collapsed || undefined}>
    <div className={styles.detailsInner}><div className={styles.content}>
      {!spectator && (viewerName || summary) && <div className={styles.profileRow}>
        {viewerName && <div className={styles.identity}>
          <span className={styles.avatar} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- existing player photo URL */}
            {viewer?.avatarUrl ? <img src={viewer.avatarUrl} alt="" /> : initials}
          </span>
          <div className={styles.identityText}><p className={styles.name}>{viewerName}</p><p className={styles.username}>{shownUsername(viewerName, viewer?.username)}</p></div>
        </div>}
      {summary && <dl className={styles.summary} aria-label="Your trip standings">
        <div><dt>TOT</dt><dd>{summary.total}</dd></div>
        <div><dt>POS</dt><dd>{summary.position.split("/")[0].trim().replace(/^T(?=\d)/, "")}</dd></div>
        {structure.team && <div><dt>Pts Ern</dt><dd>{summary.points ?? "—"}</dd></div>}
      </dl>}
      </div>}
      <h3 className={styles.date}><time dateTime={match?.roundDate || undefined}>{golfDayDateLabel(match?.roundDate)}</time></h3>
      {rounds.length ? rounds.map(round => {
        const { player, ownSide } = golfDayAssignment(round, viewerName, spectator);
        const out = roundRsvps?.[round.round]?.[viewerName ?? ""] === "out" || (round.round === match?.round && sittingOut);
        const course = courseOverviewName(player?.course || ownSide?.course || round.course || "Course not set", round.course);
        const format = round.format || "Format not set";
        const matchup = golfDayMatchNames(round, viewerName);
        return <div className={styles.round} key={round.round} aria-label={`Round ${round.round} overview`}>
          <p className={styles.course}>{spectator ? "See tee sheet" : out ? "Sitting out" : player?.teeTime || ownSide?.teeTime || "TBD"} @ {course}</p>
          <p className={styles.match}>{spectator ? format : out ? `${format} · Sitting out this round` : matchup === "No match assigned" ? `${format} · ${matchup}` : matchup}</p>
        </div>;
      }) : <p className={styles.empty}>Round not set</p>}
    </div></div>
    </div>

    <div className={styles.navigation}>{children(handle)}</div>
  </section>;
}

