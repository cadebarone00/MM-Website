"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";
import styles from "./TournamentDashboard.module.css";
import { Field } from "./editorKit";
import { lastYearsRoster, type NextEditionDraft } from "@/lib/platform/nextEdition";

/**
 * Start next year: the new year, optional dates, whether to keep this year's team names (no players, no captains),
 * and which golfers return. Nobody is ticked by default; "Select last year's roster" ticks this year's golfers and
 * any can be unticked. Returning players are the same tournament players; new players come next, on the dashboard.
 */
export function NextEditionForm({ draft, apiBase }: { draft: NextEditionDraft; apiBase: string }) {
  const router = useRouter();
  const [year, setYear] = useState(String(draft.suggestedYear));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [keepTeams, setKeepTeams] = useState(draft.teams.length > 0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const taken = draft.existingYears.includes(Number(year));
  const toggle = (id: string) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/next-edition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonYear: year, startDate, endDate, keepTeams, playerIds: [...picked] }),
      });
      const reply = await response.json().catch(() => null) as { ok?: boolean; url?: string; error?: string } | null;
      if (response.ok && reply?.ok && reply.url) {
        router.push(reply.url);
        router.refresh();
        return;
      }
      setError(reply?.error ?? "Could not start the new year. Try again.");
    } catch {
      setError("Could not reach the server. Nothing was created.");
    }
    setSaving(false);
  }

  return <form className={base.dashboard} onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate aria-label="Start next year">
    {error && <div className={base.errors} role="alert"><strong>{error}</strong></div>}
    <div className={base.fields}>
      <div className={`${styles.row} ${styles.row3}`}>
        <Field label="Year"><input type="number" min={2000} max={2200} value={year} onChange={(event) => setYear(event.target.value)} required /></Field>
        <Field label="Start date (optional)"><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field>
        <Field label="End date (optional)"><input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></Field>
      </div>
      {taken && <p className={base.callout}>This tournament already has {year}. Pick another year.</p>}
      <p className={base.muted}>Starting from {draft.fromYear}: its settings and round formats carry over; courses, dates, teams&apos; players, captains and handicaps don&apos;t.</p>
      {draft.teams.length > 0 && <label className={styles.radio}>
        <input type="checkbox" checked={keepTeams} onChange={(event) => setKeepTeams(event.target.checked)} />
        <span>Keep the team names ({draft.teams.map((team) => team.name).join(", ")}) — empty teams, no captains. You assign everyone again.</span>
      </label>}

      <fieldset className={styles.rows} aria-label="Returning players" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={base.muted} style={{ marginBottom: 8 }}>Returning players ({picked.size} picked). Nobody is added unless you tick them.</legend>
        {draft.players.length === 0 ? <p className={base.muted}>This tournament has no players yet.</p> : <>
          <div className={base.actions} style={{ justifyContent: "flex-start", gap: 16 }}>
            <button type="button" className={base.textButton} onClick={() => setPicked(new Set(lastYearsRoster(draft)))}>Select {draft.fromYear}&apos;s roster</button>
            <button type="button" className={base.textButton} onClick={() => setPicked(new Set())}>Clear</button>
          </div>
          {draft.players.map((player) => <label key={player.id} className={styles.radio}>
            <input type="checkbox" checked={picked.has(player.id)} onChange={() => toggle(player.id)} aria-label={player.name} />
            <span><strong>{player.name}</strong><br /><span className={base.muted}>
              {[player.joined ? "Joined" : "Not joined yet", player.lastSeason ? `last played ${player.lastSeason}` : null].filter(Boolean).join(" · ")}</span></span>
          </label>)}
        </>}
      </fieldset>
      <p className={base.muted}>New golfers are added on the new year&apos;s dashboard with Add new player.</p>
    </div>
    <div className={base.actions}>
      <div><button type="button" className={base.secondary} onClick={() => router.back()} disabled={saving}>Cancel</button></div>
      <button type="submit" className={base.primary} disabled={saving || taken}>{saving ? "Starting…" : `Start ${year || "next year"}`}</button>
    </div>
  </form>;
}
