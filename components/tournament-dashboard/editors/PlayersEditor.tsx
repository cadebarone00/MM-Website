"use client";

import { useEffect, useState } from "react";
import { inviteStatusesFromJson, type PlayerInviteStatus } from "@/lib/platform/tournamentPlayerInvitations";
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
      {players.length < 64 && <button type="button" className={base.textButton} onClick={() => setPlayers((rows) => [...rows, { id: null, name: "", email: "", handicap: "", teamKey: "" }])}>+ Add a player</button>}
      <p className={base.muted}>{invitesOff
        ? "Adding a player sends nothing. Player invitations aren't switched on yet."
        : "Adding a player sends nothing. Save new players first, then make each one an invite link: when they open it while signed in, their own Maroon profile joins this player."}</p>
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
