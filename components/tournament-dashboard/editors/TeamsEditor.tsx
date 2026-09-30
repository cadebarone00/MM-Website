"use client";

import { useState } from "react";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";
import { TEAM_COLORS } from "@/lib/platform/tournamentDraft";
import styles from "../TournamentDashboard.module.css";
import { EditorActions, Field, type EditorProps } from "../editorKit";

type TeamRow = { id: string | null; key: string | null; name: string; color: string; captainPlayerId: string };

export function TeamsEditor({ setup, saving, onSave, onCancel }: EditorProps) {
  const [competitionType, setCompetitionType] = useState(setup.competitionType);
  const [teams, setTeams] = useState<TeamRow[]>(setup.teams.map((team) => ({ id: team.id, key: team.key, name: team.name, color: team.color, captainPlayerId: team.captainPlayerId ?? "" })));
  const update = (index: number, patch: Partial<TeamRow>) => setTeams((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const add = () => setTeams((rows) => [...rows, { id: null, key: null, name: "", color: TEAM_COLORS[rows.length % TEAM_COLORS.length], captainPlayerId: "" }]);
  const submit = () => onSave({ competitionType, teams: competitionType === "teams" ? teams.map(({ id, name, color, captainPlayerId }) => ({ id, name, color, captainPlayerId: captainPlayerId || null })) : [] });
  return <form onSubmit={(event) => { event.preventDefault(); submit(); }} noValidate>
    <div className={base.fields}>
      <Field label="Competition">
        <select value={competitionType} onChange={(event) => { const value = event.target.value as typeof competitionType; setCompetitionType(value); if (value === "teams" && teams.length === 0) setTeams([0, 1].map((i) => ({ id: null, key: null, name: "", color: TEAM_COLORS[i], captainPlayerId: "" }))); }}>
          <option value="teams">Team tournament (two-team match play)</option>
          <option value="individual">Individual tournament (can&apos;t be played yet)</option>
        </select>
      </Field>
      {competitionType === "teams" && <>
        <div className={styles.rows}>{teams.map((team, index) => {
          const roster = team.key ? setup.players.filter((player) => player.teamKey === team.key) : [];
          return <div className={`${styles.row} ${styles.row3}`} key={team.id ?? `new-${index}`}>
            <Field label={`Team ${index + 1} name`}><input value={team.name} maxLength={40} onChange={(event) => update(index, { name: event.target.value })} /></Field>
            <Field label="Color"><input type="color" value={team.color} onChange={(event) => update(index, { color: event.target.value })} /></Field>
            <Field label="Captain" hint={team.key ? undefined : "Save, then add players to pick one."}>
              <select value={team.captainPlayerId} disabled={!roster.length} onChange={(event) => update(index, { captainPlayerId: event.target.value })}>
                <option value="">None yet</option>
                {roster.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
              </select>
            </Field>
            <button type="button" className={styles.removeButton} onClick={() => setTeams((rows) => rows.filter((_, i) => i !== index))} aria-label={`Remove team ${index + 1}`}>Remove</button>
          </div>;
        })}</div>
        {teams.length < 8 && <button type="button" className={base.textButton} onClick={add}>+ Add a team</button>}
        <p className={base.muted}>V1 plays two-team match play. Players on a removed team stay on the roster, unassigned.</p>
      </>}
    </div>
    <EditorActions saving={saving} onCancel={onCancel} />
  </form>;
}
