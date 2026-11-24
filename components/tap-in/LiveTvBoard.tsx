"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { pointsText, toParText, tvBoards, tvSideScore, TV_PHASE_WORD, type TvBoardData, type TvShow } from "@/lib/platform/liveTv";
import styles from "./LiveTvBoard.module.css";

/** Seconds each row takes to scroll past; a board that fits on screen stays put this long before the next board. */
const SECONDS_PER_ROW = 2.4;
const STILL_SECONDS = 20;

/**
 * The Maroon Live TV mode (project_specs.md, Step 4): a BlueGolf-style leaderboard for a big screen. The individual
 * board and/or the match play board, each scrolling slowly top to bottom and starting over; with both, they take turns.
 * Nothing to tap. Reduced motion: pages through instead of scrolling.
 */
export function LiveTvBoard({ data, show, surface = "desktop", player, homeHref, framed, controls, stats, statsStartOpen }: { data: TvBoardData; show: TvShow;
  /** Where it's open: a computer / TV browser ("desktop"), a phone's browser ("mobile") or the app ("app"); phones get a narrow layout. */
  surface?: "desktop" | "mobile" | "app";
  /** Desktop = TV (owner 2026-11-23), the mouse extras a TV ignores: names with a trip profile can be clicked (and the
   *  scroll pauses under the mouse), and "The Maroon Live" goes back to the directory. */
  player?: { has: (name: string) => boolean; open: (name: string) => void }; homeHref?: string;
  /** Plays inside a box (the phone's 16×9 TV screen) instead of filling the whole screen. */
  framed?: boolean;
  /** Bottom left: the Board | TV mode pills on an event page. */
  controls?: ReactNode;
  /** Bottom right: a Stats button that slides this panel out on the right, like Twitch chat; the board makes room. */
  stats?: ReactNode;
  /** The dev simulator's "Stats open" Conditional. */
  statsStartOpen?: boolean }) {
  const [statsOpen, setStatsOpen] = useState(statsStartOpen ?? false);
  const boards = tvBoards(data, show);
  const [index, setIndex] = useState(0);
  const board = boards[index % Math.max(boards.length, 1)];
  const count = Math.max(boards.length, 1);
  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);
  // Pairs / 3-Ball / 4-Ball: no team header and no team glow from the screen's sides, just the matches.
  const teamHeader = data.match?.teamHeader !== false;
  const teams = teamHeader ? data.match?.teams : undefined;
  return <div className={styles.screen} data-surface={surface} data-board={board} data-header={teamHeader ? undefined : "none"} data-interactive={player || homeHref ? "" : undefined} data-framed={framed ? "" : undefined} data-stats={stats && statsOpen ? "open" : undefined}
    style={teams ? { "--team-left": teams[0].color, "--team-right": teams[1].color } as CSSProperties : undefined}>
    <header className={styles.header}>
      {/* Owner 2026-11-22: brand with the time under it (left), name with the location / course under it (middle),
          the stage with the round under it (right): Upcoming / Live (red) / Up next / Final. */}
      <div className={styles.brand}><p>{homeHref ? <Link href={homeHref} prefetch={false} className={styles.homeLink}>The Maroon Live</Link> : "The Maroon Live"}</p><Clock /></div>
      <div className={styles.title}><h1>{data.eventName}</h1>{data.place && <p>{data.place}</p>}</div>
      <div className={styles.status}><p className={styles.live} data-phase={data.phase}>{TV_PHASE_WORD[data.phase]}</p>{data.roundLabel && <p className={styles.round}>{data.roundLabel}</p>}</div>
    </header>
    {!board ? <p className={styles.empty}>Scores will show here once the round starts.</p>
      : board === "individual" ? <Scroller key={`individual-${index}`} onCycle={boards.length > 1 ? next : undefined} heading={<IndividualHeading today={data.phase === "between" || data.phase === "final" ? "Last rd" : "Today"} />}>
        {data.individual!.map((row, i) => <div key={i} className={`${styles.row} ${row.groupStart ? styles.groupStart : ""}`}>
          <span className={styles.pos}>{row.position}</span>
          <span className={styles.player}><Name name={row.name} player={player} /></span>
          <span className={`${styles.num} ${styles.total} ${tone(row.total)}`}>{toParText(row.total)}</span>
          <span className={`${styles.num} ${styles.today} ${tone(row.today)}`}>{toParText(row.today)}</span>
          <span className={styles.num}>{row.thru}</span>
        </div>)}
      </Scroller>
      : <>
        {teamHeader && <div className={styles.teams}>
          {/* Tigers · 12½ to win · Rebels: the target sits between the two teams. */}
          {data.match!.teams.map((team, i) => <Fragment key={team.name}>
            {i === 1 && <span className={styles.toWin}>{data.phase === "final" ? <b>Final</b> : data.match!.toWin != null ? <><b>{pointsText(data.match!.toWin)}</b>to win</> : "vs"}</span>}
            <div className={`${styles.team} ${i === 1 ? styles.teamRight : ""}`} style={{ "--team": team.color } as CSSProperties}>
              <span className={styles.teamName}>{team.name}</span><span className={styles.teamPoints}>{pointsText(team.points)}</span>
            </div>
          </Fragment>)}
        </div>}
        <Scroller key={`match-${index}`} onCycle={boards.length > 1 ? next : undefined} heading={null}>
          {/* Like the app's Matches list: names on their sides, the score on the leader's half, Match # over Thru / F / tee
              time in the middle; the leading side glows from its corner. */}
          {data.match!.matches.map((m, i) => {
            const color = (side: "left" | "right") => (side === "left" ? m.leftColor : m.rightColor) ?? data.match!.teams[side === "left" ? 0 : 1].color;
            return <div key={i} className={styles.matchRow} data-leader={m.leader ?? undefined}
              style={m.leader ? { "--team": color(m.leader) } as CSSProperties : undefined}>
              <span className={`${styles.side} ${m.leader === "left" ? styles.up : ""}`}><SideName name={m.left} players={m.leftPlayers} player={player} /><span className={styles.sideScore}>{tvSideScore(m, "left")}</span></span>
              <span className={styles.middle}><span className={styles.matchNumber}>Match {m.number}</span><span className={styles.matchState}>{m.middle}</span></span>
              <span className={`${styles.side} ${styles.right} ${m.leader === "right" ? styles.up : ""}`}><SideName name={m.right} players={m.rightPlayers} player={player} /><span className={styles.sideScore}>{tvSideScore(m, "right")}</span></span>
            </div>;
          })}
        </Scroller>
      </>}
    {/* With both boards, small dots show which one is up. */}
    <footer className={styles.footer}>
      <span className={styles.footerStart}>{controls}</span>
      {boards.length > 1 ? <span className={styles.dots} aria-hidden>{boards.map((b, i) => <i key={b} data-on={i === index % boards.length ? "" : undefined} />)}</span> : <span />}
      <span className={styles.footerEnd}>{stats && <button type="button" className={styles.statsButton} aria-expanded={statsOpen} aria-controls="tv-stats" onClick={() => setStatsOpen((open) => !open)}>{statsOpen ? "Close stats" : "Stats"}</button>}</span>
    </footer>
    {stats && <aside id="tv-stats" className={styles.statsPanel} data-open={statsOpen ? "" : undefined} aria-label="Stats insights" aria-hidden={!statsOpen} inert={!statsOpen}>
      <p className={styles.statsTitle}>Stats insights</p>{stats}
    </aside>}
  </div>;
}

/** A match side: the name (a player, or a team), with the team's players under it for Pairs / 3-Ball / 4-Ball. */
function SideName({ name, players, player }: { name: string; players?: string; player?: Player }) {
  return <span className={styles.sideWho}><b className={styles.sideName}><Name name={name} player={player} /></b>{players && <span className={styles.sidePlayers}>{players}</span>}</span>;
}

type Player = { has: (name: string) => boolean; open: (name: string) => void };
/** A golfer's name: a button that opens their trip profile when there is one (computers only), else plain text. */
function Name({ name, player }: { name: string; player?: Player }) {
  return player?.has(name) ? <button type="button" className={styles.nameButton} onClick={() => player.open(name)} aria-haspopup="dialog" aria-label={`${name} public trip profile`}>{name}</button> : <>{name}</>;
}

const tone = (value: number | null) => value != null && value < 0 ? styles.under : "";

/** `today`: the round column's name, "Today" before / during a round, "Last rd" once it's finished. */
function IndividualHeading({ today }: { today: string }) {
  return <div className={`${styles.row} ${styles.headRow}`}><span className={styles.pos}>Pos</span><span className={styles.player}>Player</span>
    <span className={styles.num}>Total</span><span className={`${styles.num} ${styles.today}`}>{today}</span><span className={styles.num}>Thru</span></div>;
}

/**
 * A board's rows. When they don't fit, they scroll slowly upward and start over (the list is drawn twice so the loop
 * is seamless); `onCycle` runs after each full pass (or after STILL_SECONDS when everything fits).
 */
function Scroller({ heading, children, onCycle }: { heading: ReactNode; children: ReactNode; onCycle?: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState({ overflow: false, count: 0, pageHeight: 0, listHeight: 1 });
  const [reduced, setReduced] = useState(false);
  const [page, setPage] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      if (!viewport.current || !list.current) return;
      const pageHeight = viewport.current.clientHeight, listHeight = list.current.scrollHeight;
      setRows({ overflow: listHeight > pageHeight + 2, count: list.current.children.length, pageHeight, listHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [children]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const seconds = rows.overflow ? rows.count * SECONDS_PER_ROW : STILL_SECONDS;
  // Reduced motion: a page of rows at a time instead of scrolling.
  useEffect(() => {
    if (!reduced || !rows.overflow) return;
    const timer = window.setInterval(() => setPage((p) => p + 1), 8000);
    return () => window.clearInterval(timer);
  }, [reduced, rows.overflow]);
  useEffect(() => {
    if (!onCycle) return;
    const timer = window.setTimeout(onCycle, seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [onCycle, seconds]);
  const { pageHeight } = rows;
  const pages = Math.max(1, Math.ceil(rows.listHeight / Math.max(pageHeight, 1)));
  const moving = rows.overflow && !reduced;
  return <section className={styles.board}>
    {heading}
    <div ref={viewport} className={styles.viewport}>
      <div className={moving ? styles.scrolling : undefined} style={moving ? { animationDuration: `${seconds}s` } as CSSProperties
        : reduced && rows.overflow ? { transform: `translateY(-${(page % pages) * pageHeight}px)` } : undefined}>
        <div ref={list}>{children}</div>
        {moving && <div aria-hidden>{children}</div>}
      </div>
    </div>
  </section>;
}

/** The time, under "The Maroon Live", like a broadcast. */
function Clock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    tick();
    const timer = window.setInterval(tick, 15000);
    return () => window.clearInterval(timer);
  }, []);
  return <p className={styles.time}>{now}</p>;
}
