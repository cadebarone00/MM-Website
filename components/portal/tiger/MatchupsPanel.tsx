// components/portal/tiger/MatchupsPanel.tsx
"use client";

import { useState } from "react";
import { boxesPerRound, playersPerTeamPerBox } from "@/lib/live/orchestration";
import type { LiveMatchBox, LiveRoundState, MatchFormat } from "@/lib/live/types";

export interface RosterPlayer {
  playerSlug: string;
  fullName: string;
  team: "maroon" | "white";
}

interface BoxDraft {
  id: string | null;
  boxNumber: number;
  teeTime: string; // "HH:MM", browser-local wall-clock time
  maroonPlayers: (string | null)[];
  whitePlayers: (string | null)[];
}

function blankBox(boxNumber: number, format: MatchFormat): BoxDraft {
  const perTeam = playersPerTeamPerBox(format);
  return { id: null, boxNumber, teeTime: "", maroonPlayers: Array(perTeam).fill(null), whitePlayers: Array(perTeam).fill(null) };
}

// Renders a saved tee time (an absolute instant) back into an
// <input type="time"> using LOCAL hours/minutes, matching how saveBox()
// below interprets the typed "HH:MM" as local time when building the
// instant it sends to the server. Using toISOString() here instead would
// shift the displayed time by the browser's UTC offset on every reload.
function timeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function availablePlayers(pool: RosterPlayer[], drafts: BoxDraft[], side: "maroonPlayers" | "whitePlayers", currentBoxNumber: number, currentValue: string | null): RosterPlayer[] {
  const usedElsewhere = new Set(
    drafts
      .filter((d) => d.boxNumber !== currentBoxNumber)
      .flatMap((d) => d[side])
      .filter((p): p is string => p !== null)
  );
  return pool.filter((p) => p.playerSlug === currentValue || !usedElsewhere.has(p.playerSlug));
}

export function MatchupsPanel({
  year,
  rounds,
  initialMatchBoxes,
  roster,
}: {
  year: number;
  rounds: LiveRoundState[];
  initialMatchBoxes: LiveMatchBox[];
  roster: RosterPlayer[];
}) {
  // Saved match boxes only ever change via a full page reload, right after
  // a successful save/remove/lock (see saveBox/removeBox/toggleMatchupsLock
  // below) — so in-progress edits never need to live alongside them. They're
  // kept separately here, as plain strings/arrays keyed by "round:boxNumber"
  // and layered onto the saved data in draftFor() on every render. A reload
  // naturally clears this map along with the rest of the component's state.
  const [overrides, setOverrides] = useState<Record<string, Partial<BoxDraft>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const maroonRoster = roster.filter((p) => p.team === "maroon");
  const whiteRoster = roster.filter((p) => p.team === "white");
  const readyRounds = rounds.filter((r): r is LiveRoundState & { format: MatchFormat } => r.courseLocked && r.format !== null);

  function draftKey(round: number, boxNumber: number): string {
    return `${round}:${boxNumber}`;
  }

  function draftFor(round: number, format: MatchFormat, boxNumber: number): BoxDraft {
    const saved = initialMatchBoxes.find((b) => b.round === round && b.boxNumber === boxNumber);
    const base: BoxDraft = saved
      ? { id: saved.id, boxNumber, teeTime: timeInputValue(saved.teeTime), maroonPlayers: saved.maroonPlayers, whitePlayers: saved.whitePlayers }
      : blankBox(boxNumber, format);
    return { ...base, ...overrides[draftKey(round, boxNumber)] };
  }

  function updateDraft(round: number, boxNumber: number, patch: Partial<BoxDraft>) {
    const key = draftKey(round, boxNumber);
    setOverrides((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  async function saveBox(round: LiveRoundState & { format: MatchFormat }, draft: BoxDraft) {
    const perTeam = playersPerTeamPerBox(round.format);
    const maroonPlayers = draft.maroonPlayers.filter((p): p is string => p !== null);
    const whitePlayers = draft.whitePlayers.filter((p): p is string => p !== null);
    if (maroonPlayers.length !== perTeam || whitePlayers.length !== perTeam || !draft.teeTime) {
      setError(`Box ${draft.boxNumber}: fill in ${perTeam} player${perTeam === 1 ? "" : "s"} per side and a tee time before saving.`);
      return;
    }
    const key = `${round.round}:${draft.boxNumber}`;
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/matchboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          round: round.round,
          boxNumber: draft.boxNumber,
          teeTime: new Date(`${round.date}T${draft.teeTime}:00`).toISOString(),
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

  async function removeBox(id: string) {
    setError(null);
    const res = await fetch("/api/portal/tiger/matchboxes/remove", {
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

  async function toggleMatchupsLock(round: number, value: boolean) {
    setError(null);
    const res = await fetch("/api/portal/tiger/rounds/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, round, lock: "matchups", value }),
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
      const res = await fetch("/api/portal/tiger/matchboxes/start", {
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

  return (
    <div className="mt-6 space-y-6">
      {error && <p className="rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      {readyRounds.length === 0 && (
        <p className="font-sans text-sm text-ink-500">No rounds have their course and format locked yet — set that up in Courses & Format first.</p>
      )}

      {readyRounds.map((round) => {
        const drafts = Array.from({ length: boxesPerRound(round.format) }, (_, i) => draftFor(round.round, round.format, i + 1));
        return (
          <div key={round.round} className="rounded-lg border-2 border-stone-300 p-4">
            <div className="flex items-center justify-between">
              <span className="font-serif text-lg font-bold text-ink-900">
                Round {round.round} — {round.format}
              </span>
              <button
                type="button"
                onClick={() => toggleMatchupsLock(round.round, !round.matchupsLocked)}
                className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
              >
                {round.matchupsLocked ? "Unlock Matchups" : "Lock Matchups"}
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {drafts.map((draft) => (
                <div key={draft.boxNumber} className="rounded-lg border border-stone-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Box {draft.boxNumber}</span>
                    <div className="flex items-center gap-3">
                      <input
                        type="time"
                        value={draft.teeTime}
                        disabled={round.started}
                        onChange={(e) => updateDraft(round.round, draft.boxNumber, { teeTime: e.target.value })}
                        className="border-2 border-stone-300 rounded-lg px-2 py-1 text-sm"
                      />
                      {draft.id && !round.started && (
                        <button
                          type="button"
                          onClick={() => removeBox(draft.id!)}
                          className="font-condensed text-2xs font-semibold uppercase tracking-wide text-red-600 underline"
                        >
                          Remove
                        </button>
                      )}
                      {draft.id && round.started && (
                        <button
                          type="button"
                          disabled={busyKey === `start:${draft.id}`}
                          onClick={() => startMatch(draft.id!)}
                          className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:opacity-50"
                        >
                          {busyKey === `start:${draft.id}` ? "Starting…" : "Start Match"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <span className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700">Maroon</span>
                      {draft.maroonPlayers.map((value, i) => (
                        <select
                          key={i}
                          value={value ?? ""}
                          disabled={round.started}
                          onChange={(e) => {
                            const next = [...draft.maroonPlayers];
                            next[i] = e.target.value || null;
                            updateDraft(round.round, draft.boxNumber, { maroonPlayers: next });
                          }}
                          className="w-full border-2 border-stone-300 rounded-lg px-2 py-1 text-sm"
                        >
                          <option value="">Choose a player</option>
                          {availablePlayers(maroonRoster, drafts, "maroonPlayers", draft.boxNumber, value).map((p) => (
                            <option key={p.playerSlug} value={p.playerSlug}>
                              {p.fullName}
                            </option>
                          ))}
                        </select>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <span className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-700">White</span>
                      {draft.whitePlayers.map((value, i) => (
                        <select
                          key={i}
                          value={value ?? ""}
                          disabled={round.started}
                          onChange={(e) => {
                            const next = [...draft.whitePlayers];
                            next[i] = e.target.value || null;
                            updateDraft(round.round, draft.boxNumber, { whitePlayers: next });
                          }}
                          className="w-full border-2 border-stone-300 rounded-lg px-2 py-1 text-sm"
                        >
                          <option value="">Choose a player</option>
                          {availablePlayers(whiteRoster, drafts, "whitePlayers", draft.boxNumber, value).map((p) => (
                            <option key={p.playerSlug} value={p.playerSlug}>
                              {p.fullName}
                            </option>
                          ))}
                        </select>
                      ))}
                    </div>
                  </div>

                  {!round.started && (
                    <button
                      type="button"
                      disabled={busyKey === `${round.round}:${draft.boxNumber}`}
                      onClick={() => saveBox(round, draft)}
                      className="mt-3 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                    >
                      {busyKey === `${round.round}:${draft.boxNumber}` ? "Saving…" : "Save Box"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
