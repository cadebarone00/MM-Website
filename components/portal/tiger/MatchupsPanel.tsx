// components/portal/tiger/MatchupsPanel.tsx
"use client";

import { useState } from "react";
import { matchesPerSession, playersPerTeamPerMatch } from "@/lib/live/orchestration";
import { deriveMatchTeeTime, formatTeeTimeInZone, teeTimeSlotForMatch } from "@/lib/live/sessionTeeTimes";
import type { LiveMatch, LiveSessionState, MatchFormat } from "@/lib/live/types";

export interface RosterPlayer {
  playerSlug: string;
  fullName: string;
  team: "maroon" | "white";
}

interface MatchDraft {
  id: string | null;
  matchNumber: number;
  maroonPlayers: (string | null)[];
  whitePlayers: (string | null)[];
}

function blankMatch(matchNumber: number, format: MatchFormat): MatchDraft {
  const perTeam = playersPerTeamPerMatch(format);
  return { id: null, matchNumber, maroonPlayers: Array(perTeam).fill(null), whitePlayers: Array(perTeam).fill(null) };
}

function availablePlayers(pool: RosterPlayer[], drafts: MatchDraft[], side: "maroonPlayers" | "whitePlayers", currentMatchNumber: number, currentValue: string | null): RosterPlayer[] {
  const usedElsewhere = new Set(
    drafts
      .filter((d) => d.matchNumber !== currentMatchNumber)
      .flatMap((d) => d[side])
      .filter((p): p is string => p !== null)
  );
  return pool.filter((p) => p.playerSlug === currentValue || !usedElsewhere.has(p.playerSlug));
}

/** A left player, "Scoring For", right player — the shape every format's opponent pairing reduces to. */
function OpponentSelectRow({
  maroonValue,
  whiteValue,
  maroonOptions,
  whiteOptions,
  disabled,
  onMaroonChange,
  onWhiteChange,
}: {
  maroonValue: string | null;
  whiteValue: string | null;
  maroonOptions: RosterPlayer[];
  whiteOptions: RosterPlayer[];
  disabled: boolean;
  onMaroonChange: (value: string | null) => void;
  onWhiteChange: (value: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <select
        value={maroonValue ?? ""}
        disabled={disabled}
        onChange={(e) => onMaroonChange(e.target.value || null)}
        className="w-full rounded-lg border-2 border-maroon-700 bg-maroon-50 px-2 py-1 text-sm"
      >
        <option value="">Choose a player</option>
        {maroonOptions.map((p) => (
          <option key={p.playerSlug} value={p.playerSlug}>
            {p.fullName}
          </option>
        ))}
      </select>
      <span className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Scoring For</span>
      <select
        value={whiteValue ?? ""}
        disabled={disabled}
        onChange={(e) => onWhiteChange(e.target.value || null)}
        className="w-full rounded-lg border-2 border-stone-400 bg-stone-50 px-2 py-1 text-sm"
      >
        <option value="">Choose a player</option>
        {whiteOptions.map((p) => (
          <option key={p.playerSlug} value={p.playerSlug}>
            {p.fullName}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MatchupsPanel({
  year,
  sessions,
  initialMatches,
  roster,
  timezone,
}: {
  year: number;
  sessions: LiveSessionState[];
  initialMatches: LiveMatch[];
  roster: RosterPlayer[];
  timezone: string;
}) {
  // Saved matches only ever change via a full page reload, right after a
  // successful save/remove/lock (see saveMatch/removeMatch/toggleMatchupsLock
  // below) — so in-progress edits never need to live alongside them. They're
  // kept separately here, as plain strings/arrays keyed by "session:matchNumber"
  // and layered onto the saved data in draftFor() on every render. A reload
  // naturally clears this map along with the rest of the component's state.
  const [overrides, setOverrides] = useState<Record<string, Partial<MatchDraft>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const maroonRoster = roster.filter((p) => p.team === "maroon");
  const whiteRoster = roster.filter((p) => p.team === "white");
  const readySessions = sessions.filter((s): s is LiveSessionState & { format: MatchFormat } => s.courseLocked && s.format !== null);

  function draftKey(session: number, matchNumber: number): string {
    return `${session}:${matchNumber}`;
  }

  function draftFor(session: number, format: MatchFormat, matchNumber: number): MatchDraft {
    const saved = initialMatches.find((m) => m.session === session && m.matchNumber === matchNumber);
    const base: MatchDraft = saved
      ? { id: saved.id, matchNumber, maroonPlayers: saved.maroonPlayers, whitePlayers: saved.whitePlayers }
      : blankMatch(matchNumber, format);
    return { ...base, ...overrides[draftKey(session, matchNumber)] };
  }

  function updateDraft(session: number, matchNumber: number, patch: Partial<MatchDraft>) {
    const key = draftKey(session, matchNumber);
    setOverrides((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  function teeTimeLabelFor(session: LiveSessionState & { format: MatchFormat }, matchNumber: number): string {
    const slot = teeTimeSlotForMatch(session.format, matchNumber);
    const teeTime = deriveMatchTeeTime(session.date, session.matchTeeTimes[slot] ?? null, timezone);
    if (teeTime) return formatTeeTimeInZone(teeTime, timezone);
    // The session's own slots can be empty while its matches already hold a
    // real tee_time — e.g. right after session_tee_times.sql adds the column
    // to a season whose sessions were locked (and matches built) beforehand.
    // Show what the match is actually running on rather than "TBD".
    const saved = initialMatches.find((m) => m.session === session.session && m.matchNumber === matchNumber);
    if (saved?.teeTime && !Number.isNaN(saved.teeTime.getTime())) return formatTeeTimeInZone(saved.teeTime, timezone);
    return "Tee time TBD";
  }

  async function saveMatch(session: LiveSessionState & { format: MatchFormat }, draft: MatchDraft) {
    const perTeam = playersPerTeamPerMatch(session.format);
    const maroonPlayers = draft.maroonPlayers.filter((p): p is string => p !== null);
    const whitePlayers = draft.whitePlayers.filter((p): p is string => p !== null);
    if (maroonPlayers.length !== perTeam || whitePlayers.length !== perTeam) {
      setError(`Match ${draft.matchNumber}: fill in ${perTeam} player${perTeam === 1 ? "" : "s"} per side before saving.`);
      return;
    }
    const key = `${session.session}:${draft.matchNumber}`;
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          session: session.session,
          matchNumber: draft.matchNumber,
          maroonPlayers,
          whitePlayers,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      window.location.reload();
    } finally {
      setBusyKey(null);
    }
  }

  async function removeMatch(id: string) {
    setError(null);
    const res = await fetch("/api/portal/tiger/matches/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    window.location.reload();
  }

  async function toggleMatchupsLock(session: number, value: boolean) {
    setError(null);
    const res = await fetch("/api/portal/tiger/sessions/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, session, lock: "matchups", value }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error);
      return;
    }
    window.location.reload();
  }

  async function startMatch(id: string) {
    setBusyKey(`start:${id}`);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/matches/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      window.location.reload();
    } finally {
      setBusyKey(null);
    }
  }

  function renderMatchControls(session: LiveSessionState & { format: MatchFormat }, draft: MatchDraft, drafts: MatchDraft[]) {
    const disabled = session.started;
    if (session.format === "Foursome") {
      return (
        <div className="relative grid grid-cols-2 gap-x-6 gap-y-3">
          <select value={draft.maroonPlayers[0] ?? ""} disabled={disabled} onChange={(e) => { const next = [...draft.maroonPlayers]; next[0] = e.target.value || null; updateDraft(session.session, draft.matchNumber, { maroonPlayers: next }); }} className="w-full rounded-lg border-2 border-maroon-700 bg-maroon-50 px-2 py-1 text-sm">
            <option value="">Choose a player</option>
            {availablePlayers(maroonRoster, drafts, "maroonPlayers", draft.matchNumber, draft.maroonPlayers[0]).map((p) => <option key={p.playerSlug} value={p.playerSlug}>{p.fullName}</option>)}
          </select>
          <select value={draft.whitePlayers[0] ?? ""} disabled={disabled} onChange={(e) => { const next = [...draft.whitePlayers]; next[0] = e.target.value || null; updateDraft(session.session, draft.matchNumber, { whitePlayers: next }); }} className="w-full rounded-lg border-2 border-stone-400 bg-stone-50 px-2 py-1 text-sm">
            <option value="">Choose a player</option>
            {availablePlayers(whiteRoster, drafts, "whitePlayers", draft.matchNumber, draft.whitePlayers[0]).map((p) => <option key={p.playerSlug} value={p.playerSlug}>{p.fullName}</option>)}
          </select>
          <select value={draft.maroonPlayers[1] ?? ""} disabled={disabled} onChange={(e) => { const next = [...draft.maroonPlayers]; next[1] = e.target.value || null; updateDraft(session.session, draft.matchNumber, { maroonPlayers: next }); }} className="w-full rounded-lg border-2 border-maroon-700 bg-maroon-50 px-2 py-1 text-sm">
            <option value="">Choose a player</option>
            {availablePlayers(maroonRoster, drafts, "maroonPlayers", draft.matchNumber, draft.maroonPlayers[1]).map((p) => <option key={p.playerSlug} value={p.playerSlug}>{p.fullName}</option>)}
          </select>
          <select value={draft.whitePlayers[1] ?? ""} disabled={disabled} onChange={(e) => { const next = [...draft.whitePlayers]; next[1] = e.target.value || null; updateDraft(session.session, draft.matchNumber, { whitePlayers: next }); }} className="w-full rounded-lg border-2 border-stone-400 bg-stone-50 px-2 py-1 text-sm">
            <option value="">Choose a player</option>
            {availablePlayers(whiteRoster, drafts, "whitePlayers", draft.matchNumber, draft.whitePlayers[1]).map((p) => <option key={p.playerSlug} value={p.playerSlug}>{p.fullName}</option>)}
          </select>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full border border-ink-200 bg-white px-3 py-1 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500 shadow-sm">Scoring For</span>
          </div>
        </div>
      );
    }

    // Fourball and Singles both reduce to 1 or 2 opponent rows.
    const rows = playersPerTeamPerMatch(session.format);
    return (
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <OpponentSelectRow
            key={i}
            maroonValue={draft.maroonPlayers[i] ?? null}
            whiteValue={draft.whitePlayers[i] ?? null}
            disabled={disabled}
            maroonOptions={availablePlayers(maroonRoster, drafts, "maroonPlayers", draft.matchNumber, draft.maroonPlayers[i] ?? null)}
            whiteOptions={availablePlayers(whiteRoster, drafts, "whitePlayers", draft.matchNumber, draft.whitePlayers[i] ?? null)}
            onMaroonChange={(value) => { const next = [...draft.maroonPlayers]; next[i] = value; updateDraft(session.session, draft.matchNumber, { maroonPlayers: next }); }}
            onWhiteChange={(value) => { const next = [...draft.whitePlayers]; next[i] = value; updateDraft(session.session, draft.matchNumber, { whitePlayers: next }); }}
          />
        ))}
      </div>
    );
  }

  function renderMatchCard(session: LiveSessionState & { format: MatchFormat }, draft: MatchDraft, drafts: MatchDraft[]) {
    return (
      <div key={draft.matchNumber} className="rounded-lg border border-stone-200 p-3">
        <div className="flex items-center justify-between">
          <span className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">
            Match {draft.matchNumber} · {teeTimeLabelFor(session, draft.matchNumber)}
          </span>
          <div className="flex items-center gap-3">
            {draft.id && !session.started && (
              <button type="button" onClick={() => removeMatch(draft.id!)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-red-600 underline">
                Remove
              </button>
            )}
            {draft.id && session.started && (
              <button type="button" disabled={busyKey === `start:${draft.id}`} onClick={() => startMatch(draft.id!)} className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:opacity-50">
                {busyKey === `start:${draft.id}` ? "Starting…" : "Start Match"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-2">{renderMatchControls(session, draft, drafts)}</div>

        {!session.started && (
          <button
            type="button"
            disabled={busyKey === `${session.session}:${draft.matchNumber}`}
            onClick={() => saveMatch(session, draft)}
            className="mt-3 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
          >
            {busyKey === `${session.session}:${draft.matchNumber}` ? "Saving…" : "Save Match"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {error && <p className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      {readySessions.length === 0 && (
        <p className="font-sans text-sm text-ink-500">No sessions have their course, format, and tee times locked yet — set that up in Courses & Format first.</p>
      )}

      {readySessions.map((session) => {
        const drafts = Array.from({ length: matchesPerSession(session.format) }, (_, i) => draftFor(session.session, session.format, i + 1));
        return (
          <div key={session.session} className="rounded-lg border-2 border-stone-300 p-4">
            <div className="flex items-center justify-between">
              <span className="font-serif text-lg font-bold text-ink-900">
                Session {session.session} — {session.format}
              </span>
              <button
                type="button"
                onClick={() => toggleMatchupsLock(session.session, !session.matchupsLocked)}
                className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
              >
                {session.matchupsLocked ? "Unlock Matchups" : "Lock Matchups"}
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {session.format === "Singles"
                ? [0, 1, 2].map((slot) => (
                    <div key={slot} className={slot > 0 ? "space-y-4 border-t border-stone-200 pt-4" : "space-y-4"}>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {renderMatchCard(session, drafts[slot * 2], drafts)}
                        {renderMatchCard(session, drafts[slot * 2 + 1], drafts)}
                      </div>
                    </div>
                  ))
                : drafts.map((draft) => renderMatchCard(session, draft, drafts))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
