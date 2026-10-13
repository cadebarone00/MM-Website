"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import styles from "./TripDraftRoom.module.css";

type Player = { name: string; team: "A" | "B" };
export type MatchDraftRound = { key: string; number: number; course: string; format: string; matches: number; type: string; when: string };

/** Match-draft presentation foundation. Match assignment engines are not implemented here. */
export function TripMatchDraftRoom({ rounds, players, initialRound, onClose }: {
  rounds: MatchDraftRound[]; players: Player[]; initialRound?: string; onClose: () => void;
}) {
  const [selected, setSelected] = useState(initialRound ?? rounds[0]?.key ?? "");
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"all" | "A" | "B">("all");
  const [search, setSearch] = useState("");
  const round = rounds.find(item => item.key === selected) ?? rounds[0];
  const visible = players.filter(player => (tab === "all" || player.team === tab) && player.name.toLowerCase().includes(search.toLowerCase()));
  return <main className={`${styles.room} ${styles.matchRoom}`} style={{ display: "flex", flexDirection: "column" }} aria-label="Match Selection draft room">
    <header className={styles.header}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Back to Match Selection"><X size={22} /></button>
      <div className={styles.titleBlock}><h1>Match Selection</h1><p className={styles.when}>{round?.when || "Draft time not set"}</p></div>
      <span className={styles.count}>{players.length}<small>PLAYERS</small></span>
    </header>
    <dl className={styles.draftTypes} aria-label="Match draft configuration">
      <div><dt>Draft Type</dt><dd>{round?.type || "Not selected"}</dd></div>
      <div><dt>Format</dt><dd>{round?.format || "—"}</dd></div>
    </dl>
    {rounds.length > 0 ? <label className={styles.matchRound}>Round
      <select aria-label="Match draft round" value={round?.key} onChange={event => setSelected(event.target.value)}>{rounds.map(item => <option key={item.key} value={item.key}>Round {item.number} · {item.course}</option>)}</select>
    </label> : <p className={styles.message}>Choose Match Draft for a round in organizer Match Selection settings.</p>}
    <div className={styles.board} aria-label="Match draft board">
      <div className={styles.teamHead}><span>A</span><h2>Team A</h2><small>{round?.course || "No draft rounds selected"}</small></div>
      <div className={styles.teamHead}><span>B</span><h2>Team B</h2><small>{round ? `${round.matches} matches` : ""}</small></div>
      {Array.from({ length: round?.matches ?? 0 }, (_, index) => (["A", "B"] as const).map(team => <div key={`${team}-${index}`} className={styles.slot} data-filled={false}><span className={styles.number}>{index + 1}</span><div><strong>Match {index + 1}</strong><span className={styles.empty}>Open spot</span></div></div>))}
    </div>
    <section className={styles.sheet} data-expanded={expanded} aria-label="Match draft players">
      <button type="button" className={styles.handle} aria-expanded={expanded} aria-controls="match-draft-player-panel" onClick={() => setExpanded(value => !value)}><span className={styles.grabber} /><span>Players <small>{players.length} available</small></span>{expanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}</button>
      <div id="match-draft-player-panel" className={styles.panel} hidden={!expanded}>
        <div className={styles.tabs} role="group" aria-label="Match roster filter">{([["all", "All"], ["A", "Team A"], ["B", "Team B"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
        <label className={styles.search}><Search size={17} /><input aria-label="Search match draft players" placeholder="Search players" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className={styles.list}>{visible.map((player, index) => <div key={`${player.team}-${player.name}-${index}`} className={styles.player}><span className={styles.number}>{index + 1}</span><strong>{player.name}</strong><span>Team {player.team}</span></div>)}{!visible.length && <p className={styles.message}>No players match this selection.</p>}</div>
      </div>
    </section>
  </main>;
}
