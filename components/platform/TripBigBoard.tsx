"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { halves, type BigBoardScore } from "@/lib/platform/bigBoard";
import type { MomentumEvent } from "@/lib/platform/tripPush";
import styles from "./TripBigBoard.module.css";

/** One upcoming plan in the bottom half. `title` sits under it between < and >; tapping it opens `onOpen` / `href`. */
export type BoardSlide = { key: string; title: string; ariaLabel: string; body: ReactNode; onOpen?: () => void; href?: string };

/**
 * Trip Home → the Big Board: one gold-outlined box with the gold light from the top (the old Momentum strip and the
 * Upcoming boxes blended). Top half: the scores once a round is on or done — team points, the leader, or on a
 * Team & Individual trip both side by side (team on the left, the individual Top 4 including the viewer on the right) — with highlights;
 * before that, `momentum` (countdown, next round…). Bottom half (only this part scrolls): the upcoming plans, each with
 * its title under it; scroll sideways, tap < >, or tap a dot under the board. Same height in every state.
 */
export function TripBigBoard({ score, highlights, momentum, slides }: { score: BigBoardScore | null; highlights: MomentumEvent[]; momentum: ReactNode; slides: BoardSlide[] }) {
  const track = useRef<HTMLDivElement>(null);
  const listKey = slides.map(item => item.key).join("|");
  const [selection, setSelection] = useState({ listKey, index: 0 });
  if (selection.listKey !== listKey) setSelection({ listKey, index: 0 });
  const index = selection.listKey === listKey ? selection.index : 0;
  const setIndex = (index: number) => setSelection({ listKey, index });
  const shown = Math.min(index, Math.max(0, slides.length - 1));
  // A new list of plans starts back at the first one.
  useEffect(() => { track.current?.scrollTo({ left: 0 }); }, [listKey]);
  const goTo = (target: number) => {
    const element = track.current;
    const next = Math.min(slides.length - 1, Math.max(0, target));
    if (element) element.scrollTo({ left: next * element.clientWidth, behavior: "smooth" });
    setIndex(next);
  };
  const onScroll = () => {
    const element = track.current;
    if (element && element.clientWidth) setIndex(Math.round(element.scrollLeft / element.clientWidth));
  };

  return <div className={styles.wrap}>
    <section className={styles.board} aria-label="Big Board">
      <div className={styles.top}>{score ? <ScoreTop score={score} highlights={highlights} /> : momentum}</div>
      <div className={styles.divider} aria-hidden />
      <div className={styles.bottom} role="group" aria-roledescription="carousel" aria-label="Upcoming">
        <div ref={track} className={styles.track} onScroll={onScroll}>
          {slides.map((slide, position) => <div key={slide.key} className={styles.page} aria-roledescription="slide" aria-label={`${position + 1} of ${slides.length}`} aria-hidden={position !== shown || undefined}>
            {slide.href
              ? <Link href={slide.href} className={styles.slide} aria-label={slide.ariaLabel} tabIndex={position === shown ? 0 : -1}>{slide.body}</Link>
              : <button type="button" className={styles.slide} aria-label={slide.ariaLabel} tabIndex={position === shown ? 0 : -1} onClick={slide.onOpen}>{slide.body}</button>}
            <span className={styles.title}>{slide.title}</span>
          </div>)}
        </div>
        {/* The arrows stay put over the title row while the plans scroll under them. */}
        <button type="button" className={`${styles.arrow} ${styles.arrowLeft}`} aria-label="Previous plan" onClick={() => goTo(shown - 1)} disabled={shown === 0}><ChevronLeft size={18} aria-hidden /></button>
        <button type="button" className={`${styles.arrow} ${styles.arrowRight}`} aria-label="Next plan" onClick={() => goTo(shown + 1)} disabled={shown >= slides.length - 1}><ChevronRight size={18} aria-hidden /></button>
      </div>
    </section>
    {/* Dots under the board, one per plan (the row keeps its height even with one plan, so nothing below moves). */}
    <div className={styles.dots} role="tablist" aria-label="Upcoming plans">
      {slides.length > 1 && slides.map((slide, position) => <button key={slide.key} type="button" role="tab" className={styles.dot} aria-selected={position === shown} aria-label={`Plan ${position + 1}: ${slide.title}`} onClick={() => goTo(position)} />)}
    </div>
  </div>;
}

/** A plan's look inside the board: kind (with its icon) and status on one row, then when, then details. */
export function BoardSlideBody({ icon, kind, status, live = false, when, detail }: { icon: ReactNode; kind: string; status?: string; live?: boolean; when: string; detail?: string }) {
  return <>
    <span className={styles.slideHead}><span className={styles.slideKind}>{icon} {kind}</span>{status && <span className={styles.slideStatus} data-live={live}>{status}</span>}</span>
    <span className={styles.slideWhen}>{when}</span>
    {detail && <span className={styles.slideDetail}>{detail}</span>}
  </>;
}

/** The newest highlights, one at a time (every 10 seconds). */
function useHighlight(highlights: MomentumEvent[]) {
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (highlights.length < 2) return;
    const timer = window.setInterval(() => setTurn(current => current + 1), 10_000);
    return () => window.clearInterval(timer);
  }, [highlights.length]);
  const shown = highlights.slice(0, 5);
  return { highlight: shown.length ? shown[turn % shown.length] : null, turn };
}

/** Scores: team points with TO WIN between them, the leader, or (Team & Individual) both side by side. */
function ScoreTop({ score, highlights }: { score: BigBoardScore; highlights: MomentumEvent[] }) {
  const { highlight, turn } = useHighlight(highlights);
  const line = highlight && <p key={highlight ? `${highlight.id}-${turn}` : "line"} className={styles.line} role="status">
    {highlight ? <><b>{highlight.title}</b> {highlight.detail}</> : score.line}
  </p>;
  if (score.kind === "both") return <div className={styles.split}>
    {/* Left: the team score, condensed — each team and its points, TO WIN, then the highlight / round line. */}
    <div className={styles.splitTeam}>
      <span className={styles.splitRow}><span className={styles.teamName}>{score.left.name}</span><span className={styles.splitPoints}>{halves(score.left.points)}</span></span>
      <span className={styles.splitRow}><span className={styles.teamName}>{score.right.name}</span><span className={styles.splitPoints}>{halves(score.right.points)}</span></span>
      <span className={styles.splitToWin}><small>TO WIN</small> {halves(score.toWin)}</span>
      {line}
    </div>
    <span className={styles.splitLine} aria-hidden />
    {/* Right: the individual Top 4 including the viewer. */}
    <ol className={styles.topFive} aria-label="Top standings including you">
      {score.top.map(player => <li key={player.name}><span className={styles.topPlace}>{player.position}</span><span className={styles.topName}>{player.name}</span><span className={styles.topTotal}>{player.total}</span></li>)}
    </ol>
  </div>;
  return <div className={styles.score}>
    {score.kind === "team"
      ? <div className={styles.teams}>
        <span className={styles.team}><span className={styles.teamName}>{score.left.name}</span><span className={styles.points}>{halves(score.left.points)}</span></span>
        <span className={styles.toWin}><small>TO WIN</small>{halves(score.toWin)}</span>
        <span className={`${styles.team} ${styles.teamRight}`}><span className={styles.teamName}>{score.right.name}</span><span className={styles.points}>{halves(score.right.points)}</span></span>
      </div>
      : <div className={styles.leader}>
        <span className={styles.leaderLabel}>Leader</span>
        <span className={styles.leaderName}>{score.leader}</span>
        <span className={styles.points}>{score.total}<small className={styles.thru}>{score.thru}</small></span>
      </div>}
    {line}
  </div>;
}
