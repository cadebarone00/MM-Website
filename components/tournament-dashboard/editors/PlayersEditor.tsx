"use client";

import { useEffect, useState } from "react";
import { inviteStatusesFromJson, playerPoolFromJson, type PlayerInviteStatus, type PoolPlayer } from "@/lib/platform/tournamentPlayerInvitations";
import { PlayerInvite } from "./PlayerInvite";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";
import styles from "../TournamentDashboard.module.css";
import { EditorActions, Field, asInput, type EditorProps } from "../editorKit";

type PlayerRow = { id: string | null; name: string; email: string; handicap: string; teamKey: string };

export function PlayersEditor({ setup, saving, onSave, onCancel, apiBase }: EditorProps) {
  const [expected, setExpected] = useState(asInput(setup.expectedPlayerCount || null));
  const [players, setPlayers] = useState<PlayerRow[]>(setup.players.map((player) => ({ id: player.id, name: player.name, email: player.email ?? "", handicap: asInput(player.handicap), teamKey: player.teamKey ?? "" })));
  const update = (index: number, patch: Partial<PlayerRow>) => setPlayers((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const teams = setup.competitionType === "teams" ? setup.teams : [];
  // Invitations (saved players only): joined / invited / declined / not invited, from the organizer-only status route.
  const [statuses, setStatuses] = useState<Record<string, PlayerInviteStatus> | null>(null);
  const [invitesOff, setInvitesOff] = useState(false);
  const [statusVersion, setStatusVersion] = useState(0);
  useEffect(() => {
    if (!apiBase) return;
    let live = true;
    loadInviteStatuses(apiBase).then((result) => {
      if (!live) return;
      if (result) setStatuses(result); else setInvitesOff(true);
    });
    return () => { live = false; };
  }, [apiBase, statusVersion]);
  // Recurring tournaments: this tournament's players not on this edition yet. Picking one reuses that player (same
  // identity, same invite / profile link) with a fresh row for this edition: no team, handicap or captaincy carried over.
  const [pool, setPool] = useState<PoolPlayer[] | null>(null);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!apiBase) return;
    let live = true;
    loadPool(apiBase).then((result) => { if (live) setPool(result); });
    return () => { live = false; };
  }, [apiBase]);
  const available = (pool ?? []).filter((candidate) => !players.some((row) => row.id === candidate.id));
  const bringBack = (candidate: PoolPlayer) => {
    setPlayers((rows) => [...rows, { id: candidate.id, name: candidate.name, email: candidate.email ?? "", handicap: "", teamKey: "" }]);
    if (available.length <= 1) setPicking(false);
  };
  const submit = () => onSave({
    expectedPlayerCount: expected,
    players: players.map((player) => ({ id: player.id, name: player.name, email: player.email, handicap: player.handicap, teamKey: player.teamKey || null })),
  });
  return <form onSubmit={(event) => { event.preventDefault(); submit(); }} noValidate>
    <div className={base.fields}>
      <Field label="Planned headcount"><input type="number" min={2} max={64} value={expected} onChange={(event) => setExpected(event.target.value)} /></Field>
      <div className={styles.rows}>{players.map((player, index) =>
        <div className={`${styles.row} ${styles.row4}`} key={player.id ?? `new-${index}`}>
          <Field label={`Player ${index + 1} name`}><input value={player.name} maxLength={80} onChange={(event) => update(index, { name: event.target.value })} /></Field>
          <Field label="Email (optional)"><input type="email" value={player.email} onChange={(event) => update(index, { email: event.target.value })} /></Field>
          <Field label="Handicap"><input type="number" step="0.1" min={-10} max={54} value={player.handicap} onChange={(event) => update(index, { handicap: event.target.value })} /></Field>
          {teams.length > 0
            ? <Field label="Team"><select value={player.teamKey} onChange={(event) => update(index, { teamKey: event.target.value })}><option value="">Unassigned</option>{teams.map((team) => <option key={team.key} value={team.key}>{team.name}</option>)}</select></Field>
            : <span className={base.muted}>No teams</span>}
          <button type="button" className={styles.removeButton} onClick={() => setPlayers((rows) => rows.filter((_, i) => i !== index))} aria-label={`Remove player ${index + 1}`}>Remove</button>
          {apiBase && player.id && !invitesOff && <PlayerInvite apiBase={apiBase} playerId={player.id} name={player.name} status={statuses?.[player.id]} onInvited={() => setStatusVersion((v) => v + 1)} />}
        </div>)}
      </div>
      {players.length < 64 && <div className={base.actions} style={{ justifyContent: "flex-start", gap: 16 }}>
        <button type="button" className={base.textButton} onClick={() => setPlayers((rows) => [...rows, { id: null, name: "", email: "", handicap: "", teamKey: "" }])}>+ Add new player</button>
        {available.length > 0 && <button type="button" className={base.textButton} aria-expanded={picking} onClick={() => setPicking((open) => !open)}>+ Add existing player</button>}
      </div>}
      {picking && available.length > 0 && <div className={styles.rows} role="group" aria-label="Existing players">
        <p className={base.muted} style={{ margin: 0 }}>Players already in this tournament. Adding one keeps the same player (and their invite or joined profile); set their team for this year.</p>
        {available.map((candidate) => <div key={candidate.id} className={styles.row} style={{ gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center" }}>
          <span><strong>{candidate.name}</strong><br /><span className={base.muted}>{[candidate.joined ? "Joined" : "Not joined yet", candidate.lastSeason ? `last played ${candidate.lastSeason}` : null].filter(Boolean).join(" · ")}</span></span>
          <button type="button" className={base.secondary} onClick={() => bringBack(candidate)} disabled={players.length >= 64} aria-label={`Add ${candidate.name}`}>Add</button>
        </div>)}
      </div>}
      <p className={base.muted}>{invitesOff
        ? "Adding a player sends nothing. Player invitations aren't switched on yet."
        : "Adding a player sends nothing. Save new players first, then make each one an invite link: when they open it while signed in, their own Maroon profile joins this player."}
        {" "}A golfer who played before should be added with Add existing player, not typed again — a typed name is always a new person.</p>
    </div>
    <EditorActions saving={saving} onCancel={onCancel} />
  </form>;
}

/** The organizer-only invite statuses for this edition, or null when invitations aren't available. */
async function loadInviteStatuses(apiBase: string): Promise<Record<string, PlayerInviteStatus> | null> {
  try {
    const response = await fetch(`${apiBase}/players/invites`, { cache: "no-store" });
    const reply = await response.json().catch(() => null) as { ok?: boolean; statuses?: unknown } | null;
    return response.ok && reply?.ok ? inviteStatusesFromJson(reply.statuses) : null;
  } catch {
    return null;
  }
}

/** This tournament's players not on this edition yet, or null when unavailable. */
async function loadPool(apiBase: string): Promise<PoolPlayer[] | null> {
  try {
    const response = await fetch(`${apiBase}/players/pool`, { cache: "no-store" });
    const reply = await response.json().catch(() => null) as { ok?: boolean; players?: unknown } | null;
    return response.ok && reply?.ok ? playerPoolFromJson(reply.players) : null;
  } catch {
    return null;
  }
}
