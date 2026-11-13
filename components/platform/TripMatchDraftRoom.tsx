"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { MaroonMark } from "@/components/brand/MaroonMark";
import { matchDraftPlayerId, type MatchDraftPlayer, type MatchDraftRound } from "@/lib/platform/matchDraft";
import { mayActFor, type MatchSelectionResponse, type Side, type VisibleSpot } from "@/lib/platform/matchSelection";
import { selectionRoundFrom } from "@/lib/platform/matchSelectionSetup";
import { useMatchSelection, type MatchSelectionTransport } from "@/lib/platform/useMatchSelection";
import { mockMatchTransport, newLocalMatch } from "@/lib/dev/mockMatchSelection";
import styles from "./TripDraftRoom.module.css";
export type { MatchDraftRound } from "@/lib/platform/matchDraft";

const tick = (update: () => void) => { const id = window.setInterval(update, 1000); return () => window.clearInterval(id); };
const nowMs = () => Math.floor(Date.now() / 1000) * 1000;
const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return `${d ? `${d}d ` : ""}${d || h ? `${String(h).padStart(2, "0")}:` : ""}${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`; };

/**
 * The Match Selection Room (project_specs.md "Match Selection: rebuilt room, captains, saved and final"). Same look as the
 * Team Draft room: "Match Selection Room" with the countdown under it, the day / time in the corner, then the VS board —
 * one row per match, [Team A] VS [Team B] — a slim bar (round, whose turn, buttons) and the Players pull-up (35% → 85%).
 * Tap a box you may fill → pick a player. Everything goes through `transport` (the saved trip's server, or a pretend
 * server for simulator / dev trips); without one, a pretend server is made from `rounds` + `players`.
 */
export function TripMatchDraftRoom({ rounds, players, initialRound, onClose, modal = false, canEdit = true, teamNames = ["Team A", "Team B"], transport }: {
  rounds: MatchDraftRound[]; players: MatchDraftPlayer[]; initialRound?: string; onClose: () => void; modal?: boolean; canEdit?: boolean; teamNames?: string[];
  transport?: MatchSelectionTransport;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [roundKey, setRoundKey] = useState(initialRound ?? rounds[0]?.key ?? "");
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<{ match: number; team: Side; slot: number } | null>(null);
  useEffect(() => { if (!modal) return; const element = dialog.current; element?.showModal(); return () => element?.close(); }, [modal]);
  // No server given (simulator samples, dev trips, Settings preview): a pretend one made from these rounds and players.
  // Built from a plain-text description so it only changes when the players / rounds really do (Home redraws every second).
  const seed = JSON.stringify({ players: players.map(p => ({ id: matchDraftPlayerId(p), name: p.name, handicap: p.handicap, team: p.team })),
    rounds: rounds.map(r => ({ ...r })), teamNames: [teamNames[0] || "Team A", teamNames[1] || "Team B"] });
  const local = useMemo(() => {
    if (transport) return null;
    const parsed = JSON.parse(seed) as { players: { id: string; name: string; handicap?: number; team: "A" | "B" }[]; rounds: MatchDraftRound[]; teamNames: [string, string] };
    let hash = 5381;
    for (let index = 0; index < seed.length; index++) hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
    const key = `local:${hash.toString(36)}`;
    return mockMatchTransport(key, () => newLocalMatch(key, parsed.players.map(p => ({ profileId: p.id, name: p.name, handicap: p.handicap })),
      [parsed.players.filter(p => p.team === "A").map(p => p.id), parsed.players.filter(p => p.team === "B").map(p => p.id)], parsed.teamNames,
      parsed.rounds.flatMap(r => { const round = selectionRoundFrom(r); return round ? [{ round, locked: r.locked }] : []; })), canEdit ? "organizer" : "player");
  }, [transport, seed, canEdit]);
  const live = useMatchSelection(transport ?? local, roundKey || null);
  const data: MatchSelectionResponse | null = live.data;
  const now = useSyncExternalStore(tick, nowMs, () => null);
  const source = rounds.find(r => r.key === roundKey);
  const round = data?.round;
  const viewer = data?.viewer;
  const label = (team: Side) => data?.teamNames[team] || teamNames[team] || `Team ${team ? "B" : "A"}`;
  const member = (id: string | null) => data?.members.find(m => m.profileId === id);
  const spotAt = (match: number, team: Side, slot: number): VisibleSpot | undefined => data?.spots.find(s => s.match === match && s.team === team && s.slot === slot);
  const locked = !!source?.locked && !data?.completed;
  const active = !!data?.started && !data.completed && !locked;
  const canTap = (match: number, team: Side, slot: number) => {
    if (!data || !round || !viewer || !active || live.busy || !mayActFor(viewer, team)) return false;
    if (spotAt(match, team, slot)?.submitted) return false;
    if (round.type === "Response") return data.turn?.match === match && data.turn.team === team;
    return round.type === "Ranks" && !data.locked[team];
  };
  // The pull-up lists the team you're placing for: the tapped box's team, else your own team, else whoever is on turn.
  const listTeam: Side = target?.team ?? viewer?.captainOf ?? data?.turn?.team ?? 0;
  const finalIds = new Set(data?.spots.filter(s => s.submitted && s.profileId).map(s => s.profileId!) ?? []);
  const placedIds = new Set(data?.spots.filter(s => !s.submitted && s.profileId).map(s => s.profileId!) ?? []);
  const listed = (data?.rosters[listTeam] ?? []).filter(id => !finalIds.has(id)).map(id => member(id)).filter((m): m is NonNullable<typeof m> => !!m)
    .filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  const nextEmpty = (from: { match: number; team: Side }, after: MatchSelectionResponse) => {
    if (!after.round) return null;
    const matches = after.round.type === "Response" ? [from.match] : Array.from({ length: after.round.matches }, (_, m) => m);
    for (const match of matches) for (let slot = 0; slot < after.round.perSide; slot++)
      if (!after.spots.some(s => s.match === match && s.team === from.team && s.slot === slot)) return { match, team: from.team, slot };
    return null;
  };
  const place = async (playerId: string) => {
    if (!target) return;
    const placed = await live.act({ action: "place", ...target, player: playerId });
    if (!placed) return;
    setSearch("");
  };
  // After a placement, move to the next empty spot of the same group / team (or close the list when there's none).
  const lastData = useRef(data);
  useEffect(() => {
    if (lastData.current === data) return;
    lastData.current = data;
    if (!target || !data) return;
    if (!data.spots.some(s => s.match === target.match && s.team === target.team && s.slot === target.slot)) return;
    const next = nextEmpty(target, data);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow the server's answer to the next empty spot
    setTarget(next);
    if (!next) setExpanded(false);
  }, [data, target]);

  const turnLabel = data?.turn ? `${label(data.turn.team)} ${data.turn.opening ? "puts forward" : "responds"} · Match ${data.turn.match + 1}` : "";
  const remaining = data?.deadline && now !== null ? Date.parse(data.deadline) - (now + live.clockOffset) : null;
  const scheduled = source?.date ? Date.parse(`${source.date}T${source.time || "00:00"}`) : NaN;
  const countdown = remaining !== null ? clock(remaining) : !data?.started && Number.isFinite(scheduled) && now !== null ? clock(scheduled - now) : "--:--";
  const whenParts = source?.when?.includes(" @ ") ? [source.when.slice(0, source.when.indexOf(" @ ")), source.when.slice(source.when.indexOf(" @ ") + 3).replace(/^0/, "")] : [source?.when || "Time not set"];
  const status = live.message || (!rounds.length ? "No rounds use Match Draft yet. Choose Match Draft for a round in Settings → Match Selection."
    : locked ? "This round has been played — its matches are locked."
    : data?.completed ? "Match selection complete — the matches are saved."
    : !data ? "Loading match selection…"
    : !data.started ? (data.startError ?? (viewer?.isOrganizer ? (round?.type === "Randomized" ? "Tap Randomize to draw the matches." : "Tap Start when both captains are ready.") : "Waiting for the organizer to start."))
    : round?.type === "Response" ? (viewer && data.turn && mayActFor(viewer, data.turn.team) ? `Your turn: ${turnLabel}` : `${turnLabel} — you'll see it once it's submitted.`)
    : `Ranks: each captain ranks their team. You can't see the other team's ranks until both lock in.`);
  const group = data?.turn ? data.spots.filter(s => s.match === data.turn!.match && s.team === data.turn!.team) : [];
  const teamFull = (team: Side) => (data?.spots.filter(s => s.team === team).length ?? 0) >= (round ? round.matches * round.perSide : Infinity);

  const box = (match: number, team: Side, slot: number) => {
    const spot = spotAt(match, team, slot);
    const who = spot?.profileId ? member(spot.profileId) : undefined;
    const tappable = canTap(match, team, slot);
    const body = who ? <><span className={styles.rowAvatar} aria-hidden>{who.avatarUrl ? <img src={who.avatarUrl} alt="" /> : <span className={styles.rowMark}><MaroonMark color="var(--color-maroon-900)" /></span>}</span>
      <span className={styles.vsWho}><strong>{who.name}</strong><small>{spot?.submitted ? (who.handicap === undefined ? "Final" : `HCP ${who.handicap}`) : "Not submitted"}</small></span></>
      : spot?.hidden ? <span className={styles.vsHidden}>{round?.type === "Ranks" ? "Ranked ✓" : "Picked ✓"}</span>
      : <span className={styles.empty}>{tappable ? "Tap to place" : "Open"}</span>;
    const props = { className: styles.vsBox, "data-filled": !!spot, "data-target": target?.match === match && target.team === team && target.slot === slot, "data-active": tappable };
    return tappable ? <button key={slot} type="button" {...props} aria-label={`${label(team)} ${round?.type === "Ranks" ? "rank" : "match"} ${match + 1}${round && round.perSide > 1 ? `, player ${slot + 1}` : ""}: ${who ? `${who.name}, change` : "tap to place"}`}
      onClick={() => { setTarget({ match, team, slot }); setExpanded(true); setSearch(""); }}>{body}</button> : <div key={slot} {...props}>{body}</div>;
  };

  const content = <>
    <header className={`${styles.header} ${styles.headerCompact}`}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close match selection room"><X size={22} /></button>
      <div className={styles.titleBlock}><h1 id="match-draft-title">Match Selection Room</h1>
        <div className={styles.timer} role="timer" aria-label={remaining !== null ? `${countdown} left on this ${round?.type === "Ranks" ? "ranking window" : "turn"}` : "Countdown to match selection"}><span>{countdown}</span></div>
      </div>
      <p className={styles.cornerWhen}>{whenParts.map(part => <span key={part}>{part}</span>)}</p>
    </header>
    <p className={styles.liveStatus} role="status">{status}</p>
    <div className={styles.vsBoard} aria-label="Match selection board">
      <div className={styles.vsHead}><span /><span className={styles.vsTeam}>{label(0)}{round?.type === "Ranks" && data?.locked[0] ? " · locked ✓" : ""}</span><span /><span className={styles.vsTeam}>{label(1)}{round?.type === "Ranks" && data?.locked[1] ? " · locked ✓" : ""}</span></div>
      {round && Array.from({ length: round.matches }, (_, match) => <div key={match} className={styles.vsRow} data-turn={data?.turn?.match === match}>
        <span className={styles.vsLabel}>{round.type === "Ranks" ? "Rank" : "Match"} {match + 1}</span>
        <div className={styles.vsSide}>{Array.from({ length: round.perSide }, (_, slot) => box(match, 0, slot))}</div>
        <span className={styles.vsVs}>VS</span>
        <div className={styles.vsSide}>{Array.from({ length: round.perSide }, (_, slot) => box(match, 1, slot))}</div>
      </div>)}
      {!round && !live.message && rounds.length > 0 && <p className={styles.message}>Loading…</p>}
    </div>
    <div className={styles.controlBar}>
      {rounds.length > 1 && <label className={styles.roundSelect}><span>Round</span><select aria-label="Match selection round" value={roundKey} onChange={event => { setRoundKey(event.target.value); setTarget(null); setExpanded(false); }}>
        {rounds.map(r => <option key={r.key} value={r.key}>Round {r.number} · {r.course} · {r.format}</option>)}</select></label>}
      <div className={styles.controlButtons}>
        {data && !data.started && !locked && viewer?.isOrganizer && <button type="button" className={styles.pick} disabled={live.busy || !!data.startError} onClick={() => void live.act({ action: round?.type === "Randomized" ? "randomize" : "start" })}>{round?.type === "Randomized" ? "Randomize" : "Start match selection"}</button>}
        {active && round?.type === "Response" && data?.turn && viewer && mayActFor(viewer, data.turn.team) && <button type="button" className={styles.pick} disabled={live.busy || group.length < round.perSide} onClick={() => { setTarget(null); setExpanded(false); void live.act({ action: "submit" }); }}>{round.perSide === 1 ? "Submit single" : "Submit pairing"}</button>}
        {active && round?.type === "Ranks" && viewer && ([0, 1] as const).filter(team => mayActFor(viewer, team) && !data?.locked[team]).map(team => <button key={team} type="button" className={styles.pick} disabled={live.busy || !teamFull(team)} onClick={() => { setTarget(null); setExpanded(false); void live.act({ action: "lock", team }); }}>Lock in {viewer.isOrganizer ? label(team) : "ranks"}</button>)}
      </div>
    </div>
    {expanded && <div className={styles.sheetBackdrop} aria-hidden="true" onClick={() => setExpanded(false)} />}
    <section className={`${styles.sheet} ${styles.peekSheet}`} data-expanded={expanded} aria-label="Match selection players">
      <button type="button" className={styles.handle} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><span className={styles.grabber} />
        <span>{target ? `${label(target.team)} · ${round?.type === "Ranks" ? "Rank" : "Match"} ${target.match + 1}` : `${label(listTeam)} players`} <small>{listed.length} available</small></span>{expanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}</button>
      <div className={styles.panel}>
        <label className={styles.search}><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search players" aria-label="Search match selection players" /></label>
        {target && spotAt(target.match, target.team, target.slot)?.profileId && <button type="button" className={styles.clearSpot} disabled={live.busy} onClick={() => void live.act({ action: "remove", ...target })}>Clear this spot</button>}
        <div className={styles.list}><div className={styles.listHead}><span>{target ? "TAP PLACE TO PUT A PLAYER HERE" : "TAP A GLOWING BOX TO PLACE A PLAYER"}</span></div>
          {listed.map((m, index) => <div key={m.profileId} className={styles.playerRow}>
            <span className={styles.rowNumber}>{index + 1}</span>
            <span className={styles.rowAvatar} aria-hidden>{m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : <span className={styles.rowMark}><MaroonMark color="var(--color-maroon-900)" /></span>}</span>
            <div className={styles.playerBox}>
              {m.username && <a className={styles.profileLink} href={`/profile/${encodeURIComponent(m.username)}`} aria-label={`Open ${m.name}'s profile`} />}
              <div className={styles.playerBoxTop}><strong>{m.name}{placedIds.has(m.profileId) ? <small className={styles.placedTag}> · placed</small> : null}</strong>
                {target && canTap(target.match, target.team, target.slot) && <button type="button" className={styles.pick} disabled={live.busy} aria-label={`Place ${m.name} in ${label(target.team)} ${round?.type === "Ranks" ? "rank" : "match"} ${target.match + 1}`} onClick={() => void place(m.profileId)}>Place</button>}</div>
              <dl className={styles.statRow} aria-label={`${m.name} stats`}><div><dt>HCP</dt><dd>{m.handicap === undefined ? "—" : m.handicap.toFixed(1)}</dd></div></dl>
            </div>
          </div>)}
          {!listed.length && <p className={styles.message}>{search ? "No players match your search." : "Everyone on this team is placed."}</p>}
        </div>
      </div>
    </section>
  </>;
  return modal ? createPortal(<dialog ref={dialog} className={styles.room} aria-labelledby="match-draft-title" onCancel={onClose}>{content}</dialog>, document.body)
    : <main className={styles.room} style={{ display: "flex", flexDirection: "column", position: "relative" }} aria-label="Match Selection Room">{content}</main>;
}
