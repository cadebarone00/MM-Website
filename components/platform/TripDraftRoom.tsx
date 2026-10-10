"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import styles from "./TripDraftRoom.module.css";

export type DraftRoomPlayer = { name: string; handicap?: number; team?: "A" | "B" };

export function TripDraftRoom({ players, draftType, onClose }: { players: DraftRoomPlayer[]; draftType: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"available" | "A" | "B">("available");
  const [search, setSearch] = useState("");
  const [picks, setPicks] = useState<Record<string, "A" | "B">>({});
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; element?.close(); };
  }, []);
  const roster = players.filter((player, index) => players.findIndex(other => other.name === player.name) === index).map(player => ({ ...player, team: picks[player.name] ?? player.team }));
  const pickCount = Object.keys(picks).length;
  const nextTeam = (draftType === "Snake" ? ["A", "B", "B", "A"] as const : ["A", "B"] as const)[pickCount % (draftType === "Snake" ? 4 : 2)];
  const teams = { A: roster.filter(player => player.team === "A"), B: roster.filter(player => player.team === "B") };
  const available = roster.filter(player => !player.team);
  const visible = (tab === "available" ? available : teams[tab]).filter(player => player.name.toLowerCase().includes(search.toLowerCase()));
  const rows = Math.max(6, teams.A.length, teams.B.length, Math.ceil(roster.length / 2));
  return createPortal(<dialog ref={dialog} className={styles.room} onCancel={onClose} aria-labelledby="draft-room-title">
    <header className={styles.header}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close draft room"><X size={22} /></button>
      <div><p>TEAM DRAFT · {draftType.toUpperCase()}</p><h1 id="draft-room-title">Draft Room</h1></div>
      <span className={styles.count}>{roster.length}<small>PLAYERS</small></span>
    </header>
    <div className={styles.board} aria-label="Team draft board">
      <div className={styles.teamHead}><span>A</span><h2>Team A</h2><small>{teams.A.length} {teams.A.length === 1 ? "player" : "players"}</small></div>
      <div className={styles.teamHead}><span>B</span><h2>Team B</h2><small>{teams.B.length} {teams.B.length === 1 ? "player" : "players"}</small></div>
      {Array.from({ length: rows }, (_, index) => (["A", "B"] as const).map(team => {
        const player = teams[team][index];
        return <div key={`${team}-${index}`} className={styles.slot} data-filled={Boolean(player)}><span className={styles.number}>{index + 1}</span><div>{player ? <><strong>{player.name}</strong><small>{player.handicap === undefined ? "Team roster" : `HCP ${player.handicap}`}</small></> : <span className={styles.empty}>Open spot</span>}</div></div>;
      }))}
    </div>
    <section className={styles.sheet} data-expanded={expanded} aria-label="Draft players">
      <button type="button" className={styles.handle} aria-expanded={expanded} aria-controls="draft-player-panel" onClick={() => setExpanded(value => !value)}><span className={styles.grabber} /><span>Players <small>{available.length} available</small></span>{expanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}</button>
      <div id="draft-player-panel" className={styles.panel} hidden={!expanded}>
        <div className={styles.tabs} role="group" aria-label="Player roster filter">{([["available", "Available"], ["A", "Team A"], ["B", "Team B"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
        <label className={styles.search}><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search players" aria-label="Search draft players" /></label>
        <div className={styles.list}><div className={styles.listHead}><span>{tab === "available" && available.length ? `TEAM ${nextTeam} PICKS · PLAYER` : "PLAYER"}</span><span>HCP</span></div>{visible.map((player, index) => <div key={player.name} className={styles.player}><span className={styles.number}>{index + 1}</span><strong>{player.name}</strong><span>{player.handicap ?? "—"}</span>{tab === "available" && <button type="button" className={styles.pick} aria-label={`Draft ${player.name} to Team ${nextTeam}`} onClick={() => setPicks(current => ({ ...current, [player.name]: nextTeam }))}>Draft</button>}</div>)}{visible.length === 0 && <p className={styles.message}>{search ? "No players match your search." : tab === "available" ? "No available players." : "No players on this team yet."}</p>}</div>
      </div>
    </section>
  </dialog>, document.body);
}
