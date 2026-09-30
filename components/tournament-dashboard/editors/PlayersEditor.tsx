"use client";

import { useState } from "react";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";
import styles from "../TournamentDashboard.module.css";
import { EditorActions, Field, asInput, type EditorProps } from "../editorKit";

type PlayerRow = { id: string | null; name: string; email: string; handicap: string; teamKey: string };

export function PlayersEditor({ setup, saving, onSave, onCancel }: EditorProps) {
  const [expected, setExpected] = useState(asInput(setup.expectedPlayerCount || null));
  const [players, setPlayers] = useState<PlayerRow[]>(setup.players.map((player) => ({ id: player.id, name: player.name, email: player.email ?? "", handicap: asInput(player.handicap), teamKey: player.teamKey ?? "" })));
  const update = (index: number, patch: Partial<PlayerRow>) => setPlayers((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const teams = setup.competitionType === "teams" ? setup.teams : [];
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
        </div>)}
      </div>
      {players.length < 64 && <button type="button" className={base.textButton} onClick={() => setPlayers((rows) => [...rows, { id: null, name: "", email: "", handicap: "", teamKey: "" }])}>+ Add a player</button>}
      <p className={base.muted}>Adding a player sends nothing. Invitations come later.</p>
    </div>
    <EditorActions saving={saving} onCancel={onCancel} />
  </form>;
}
