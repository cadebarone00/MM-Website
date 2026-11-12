"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { MatchDraftPlayer } from "@/lib/platform/matchDraft";
import { teamDraftSize, teamDraftTeamCount, teamDraftTurn, teamLetter } from "@/lib/platform/teamDraft";
import { MaroonMark } from "@/components/brand/MaroonMark";
import styles from "./TripDraftRoom.module.css";

/**
 * A player in the Draft Room. `team` ("A"/"B") or `teamIndex` (0 = Team A, 1 = Team B, 2 = Team C …) = already on that team;
 * `captain` = that team's captain (sits in spot 1).
 */
export type DraftRoomPlayer = { /** Their account (saved drafts): what a pick sends. */ id?: string; name: string; handicap?: number; team?: "A" | "B"; teamIndex?: number; captain?: boolean; avatarUrl?: string | null; stats?: DraftPlayerStats;
  /** Their @username: tapping their box opens their profile (/profile/<username>). None = the box doesn't open anything. */
  username?: string | null;
  /** Where their box links instead (the simulator's sample players open the sample public / private profile). */
  profileHref?: string | null };

/** The stats row under each player in the Players list. Missing = "—". */
export type DraftPlayerStats = {
  /** Average 18-hole score, and the same with every hole capped at double bogey (Profile → Stats "adjusted"). */
  average?: number | null; adjusted?: number | null;
  /** Match-play points per game. */
  ppg?: number | null;
  /** Fairways hit % and greens in regulation %. */
  fairwayPct?: number | null; girPct?: number | null;
  /** Birdies (or better) per round. */
  birdiesPerRound?: number | null;
};

const one = (value: number | null | undefined) => value === null || value === undefined ? "—" : value.toFixed(1);
const percent = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${Math.round(value)}%`;
/** Handicap, Average score, Adjusted average, PPG, FWY%, GIR%, BPR (Birdies Per Round), in that order. */
const statCells = (player: DraftRoomPlayer): [string, string][] => [
  ["HCP", one(player.handicap)], ["AVG", one(player.stats?.average)], ["ADJ", one(player.stats?.adjusted)], ["PPG", one(player.stats?.ppg)],
  ["FWY%", percent(player.stats?.fairwayPct)], ["GIR%", percent(player.stats?.girPct)], ["BPR", one(player.stats?.birdiesPerRound)],
];

/**
 * The team draft. Every team type shows team boxes in 2 columns, the team name at the top of each box: 2 Teams = two tall
 * boxes; Pairs / 3-Ball / 4-Ball = one box per team (2, 3 or 4 spots, the captain in spot 1). Picks follow Snake or Straight across every team, skip full teams and stop when all are full.
 * Without `live`, picks are room-local; an explicit completion callback can hand a complete two-team roster back to Home.
 * With `live` (a saved trip): the players already carry the saved picks, Draft sends the pick to the server, and the server
 * decides — a drafted player stays on that team for good (project_specs.md "Team Draft: picks are saved and final").
 */
export type LiveDraftRoom = {
  started: boolean;
  /** This viewer may pick for that team (captain of it, or the organizer). */
  canPick: (team: number) => boolean;
  canStart: boolean;
  busy: boolean;
  /** One status line under the header ("", waiting / error / complete). */
  message: string;
  onPick: (playerId: string) => void;
  onStart: () => void;
};
export function TripDraftRoom({ players, draftType, draftOrder, countdown, when, onClose, onComplete, canEdit = false, teamType = "2 Teams", live, keepKey }: { live?: LiveDraftRoom; /** Simulator samples: keep picks for the browser tab under this name. */ keepKey?: string; players: DraftRoomPlayer[]; draftType: "Captain's Picks" | "Duck Race"; draftOrder: "Snake" | "Straight"; when: string; countdown?: { days: number; hours: number; minutes: number; seconds: number } | null; onClose: () => void; canEdit?: boolean; onComplete?: (players: MatchDraftPlayer[]) => void; teamType?: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  // Simulator samples keep their picks for the browser tab (sessionStorage), so opening a profile and coming back keeps them.
  const kept = () => { try { return keepKey ? JSON.parse(window.sessionStorage.getItem(`draft-room:${keepKey}`) ?? "null") as { started: boolean; picks: Record<string, number> } | null : null; } catch { return null; } };
  const [started, setStarted] = useState(() => kept()?.started ?? false);
  const [picks, setPicks] = useState<Record<string, number>>(() => kept()?.picks ?? {});
  useEffect(() => { if (!keepKey) return; try { window.sessionStorage.setItem(`draft-room:${keepKey}`, JSON.stringify({ started, picks })); } catch { /* storage blocked: picks last while the room is open */ } }, [keepKey, started, picks]);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; element?.close(); };
  }, []);
  const size = teamDraftSize(teamType);
  const unique = players.filter((player, index) => players.findIndex(other => other.name === player.name) === index);
  const teamCount = teamDraftTeamCount(teamType, unique.length);
  const capacity = size ?? Infinity;
  const startTeam = (player: DraftRoomPlayer) => player.teamIndex ?? (player.team === "A" ? 0 : player.team === "B" ? 1 : undefined);
  const roster = unique.map(player => ({ ...player, on: picks[player.name] ?? startTeam(player) })).map(player => ({ ...player, on: player.on !== undefined && player.on < teamCount ? player.on : undefined }));
  // Each team: captain first, then everyone else in the order they joined it.
  const teams = Array.from({ length: teamCount }, (_, team) => roster.filter(player => player.on === team).sort((a, b) => Number(!!b.captain) - Number(!!a.captain)));
  const start = Array.from({ length: teamCount }, (_, team) => unique.filter(player => player.captain && startTeam(player) === team).length);
  const available = roster.filter(player => player.on === undefined);
  const turn = available.length ? teamDraftTurn(draftOrder, teams.map(team => team.length), start, capacity) : null;
  const isStarted = live ? live.started : started;
  const picking = (live ? turn !== null && live.canPick(turn) && !live.busy : canEdit) && isStarted && draftType === "Captain's Picks" && turn !== null;
  const label = (team: number) => `Team ${teamLetter(team)}`;
  // The list shows the players still available (no Available / Team pills).
  const visible = available.filter(player => player.name.toLowerCase().includes(search.toLowerCase()));
  // Spots in each box: the team size, or for 2 Teams half the players (rounded up).
  const spots = size ?? Math.max(1, Math.ceil(roster.length / 2), ...teams.map(team => team.length));
  const done = draftType === "Captain's Picks" && turn === null && roster.some(player => player.on !== undefined);
  const slotText = (player: (typeof roster)[number] | undefined, spot: number) => player
    ? <><strong>{player.name}</strong><small>{player.captain ? "Captain" : player.handicap === undefined ? "Team roster" : `HCP ${player.handicap}`}</small></>
    : <span className={styles.empty}>{spot === 0 && size ? "Captain spot" : "Open spot"}</span>;
  // "Fri, Nov 13th @ 09:15 PM CST" → ["Fri, Nov 13th", "9:15 PM CST"] (the corner shows the day over the time).
  const whenParts = when.includes(" @ ") ? [when.slice(0, when.indexOf(" @ ")), when.slice(when.indexOf(" @ ") + 3).replace(/^0/, "")] : [when];
  // The Players list is a pull-up at the bottom: it rests 35% up with the list already showing; tapping its bar raises it to
  // 85% and blurs the board behind it (tap the blur or the bar to lower it). The team boxes start right under the header line.
  const playersSheet = <>
    {expanded && <div className={styles.sheetBackdrop} aria-hidden="true" onClick={() => setExpanded(false)} />}
    <section className={`${styles.sheet} ${styles.peekSheet}`} data-expanded={expanded} aria-label="Draft players">
      <button type="button" className={styles.handle} aria-expanded={expanded} aria-controls="draft-player-panel" onClick={() => setExpanded(value => !value)}><span className={styles.grabber} /><span>Players <small>{available.length} available</small></span>{expanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}</button>
      <div id="draft-player-panel" className={styles.panel}>
        <label className={styles.search}><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search players" aria-label="Search draft players" /></label>
        <div className={styles.list}><div className={styles.listHead}><span>{picking ? `${label(turn!).toUpperCase()} PICKS · PLAYER` : "PLAYER"}</span></div>{/* Each player: number (no box, where Home / the leaderboard put it), avatar, then their own box — name (+ Draft) over a stats row. */}{visible.map((player, index) => <div key={player.name} className={styles.playerRow}>
          <span className={styles.rowNumber}>{index + 1}</span>
          <span className={styles.rowAvatar} aria-hidden>{player.avatarUrl ? <img src={player.avatarUrl} alt="" /> : <span className={styles.rowMark}><MaroonMark color="var(--color-maroon-900)" /></span>}</span>
          <div className={styles.playerBox}>
            {/* The whole box opens their profile (what others may see follows their Public / Private setting); Draft sits above it. */}
            {(player.profileHref || player.username) && <a className={styles.profileLink} href={player.profileHref || `/profile/${encodeURIComponent(player.username!)}`} aria-label={`Open ${player.name}'s profile`} />}
            <div className={styles.playerBoxTop}><strong>{player.name}</strong>{picking && <button type="button" className={styles.pick} aria-label={`Draft ${player.name} to ${label(turn!)}`} onClick={() => { if (live) live.onPick(player.id ?? player.name); else if (canEdit && started) setPicks(current => ({ ...current, [player.name]: turn! })); }}>Draft</button>}</div>
            <dl className={styles.statRow} aria-label={`${player.name} stats`}>{statCells(player).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
          </div>
        </div>)}{visible.length === 0 && <p className={styles.message}>{search ? "No players match your search." : "No available players."}</p>}{done && available.length > 0 && <p className={styles.message}>Every team is full. {available.length === 1 ? "This player isn't" : "These players aren't"} on a team.</p>}</div>
        {!live && canEdit && onComplete && done && available.length === 0 && teams.every(team => team.length > 0) && <button type="button" className={styles.pick} onClick={() => onComplete(roster.map(player => ({ id: String(players.findIndex(source => source.name === player.name)), name: player.name, handicap: player.handicap, team: player.on === 0 ? "A" : "B" })))}>Complete team draft</button>}
      </div>
    </section>
  </>;
  return createPortal(<dialog ref={dialog} className={styles.room} onCancel={onClose} aria-labelledby="draft-room-title">
    {/* "Team Draft Room" centered with the countdown under it; the draft day over its time in the right corner. */}
    <header className={`${styles.header} ${styles.headerCompact}`}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close draft room"><X size={22} /></button>
      <div className={styles.titleBlock}><h1 id="draft-room-title">Team Draft Room</h1>
      <div className={styles.timer} role="timer" aria-label={countdown ? `${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds until the draft` : "Draft time not set"}>
        <span>{countdown ? `${countdown.days ? `${countdown.days}d ` : ""}${countdown.days || countdown.hours ? `${String(countdown.hours).padStart(2, "0")}:` : ""}${String(countdown.minutes).padStart(2, "0")}:${String(countdown.seconds).padStart(2, "0")}` : "?:?"}</span>
      </div>
      </div>
      <div className={styles.cornerControls}>
        <p className={styles.cornerWhen}>{whenParts.map(part => <span key={part}>{part}</span>)}</p>
        {(live ? live.canStart && !isStarted : canEdit && !started) && !done && <button type="button" className={`${styles.pick} ${styles.startDraft}`} disabled={draftType !== "Captain's Picks" || roster.length < 2 || live?.busy} onClick={() => { if (live) live.onStart(); else if (canEdit && draftType === "Captain's Picks") setStarted(true); }}>Start team draft</button>}
      </div>
    </header>
    {live?.message && <p className={styles.liveStatus} role="status">{live.message}</p>}
    <div className={styles.teamGrid} data-two={!size} aria-label="Team draft board">
      {/* 2 Teams: the team name sits above its column and every player gets their own box. Pairs / 3-Ball / 4-Ball: one box per team. */}
      {teams.map((team, index) => <section key={index} className={size ? styles.teamCard : styles.teamColumn} data-on-clock={picking && turn === index} aria-label={label(index)}>
        <div className={size ? styles.teamCardHead : styles.teamColumnHead}><h2>{label(index)}</h2><small>{size ? `${team.length} / ${size}` : `${team.length} ${team.length === 1 ? "player" : "players"}`}</small></div>
        {Array.from({ length: spots }, (_, spot) => <div key={spot} className={size ? styles.slot : `${styles.slot} ${styles.slotBox}`} data-filled={Boolean(team[spot])}><span className={styles.number}>{spot + 1}</span><div>{slotText(team[spot], spot)}</div></div>)}
      </section>)}
    </div>
    {playersSheet}
  </dialog>, document.body);
}
