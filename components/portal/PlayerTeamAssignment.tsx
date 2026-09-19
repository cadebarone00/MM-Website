"use client";

import { useState } from "react";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";

export interface PlayerTeamRow {
  playerSlug: string;
  fullName: string;
  team: "maroon" | "white" | null;
  teamLocked: boolean;
}

export function PlayerTeamAssignment({ year, rows: initialRows }: { year: number; rows: PlayerTeamRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRowsState] = useState(initialRows);

  async function handleSetTeam(playerSlug: string, team: "maroon" | "white" | null) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, playerSlug, team }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      window.location.reload();
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleTeamLock(playerSlug: string, locked: boolean) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/roster/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, playerSlug, locked }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setRowsState((current) => current.map((row) => (row.playerSlug === playerSlug ? { ...row, teamLocked: locked } : row)));
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Players & Teams</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">Assign each player to Maroon or White for this year.</p>
      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <table className="mt-6 w-full border-collapse font-sans text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left">
            <th className="py-2">Player</th>
            <th className="py-2">Team</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.playerSlug} className="border-b border-ink-100">
              <td className="py-2">{row.fullName}</td>
              <td className="py-2">
                <div className="flex flex-wrap items-center gap-1">
                  {([
                    [null, "Unassigned"],
                    ["maroon", "Maroon"],
                    ["white", "White"],
                  ] as const).map(([team, label]) => {
                    const selected = row.team === team;
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={busy === row.playerSlug || row.teamLocked}
                        onClick={() => handleSetTeam(row.playerSlug, team)}
                        className={[
                          "rounded-sm border px-2 py-1 font-condensed text-2xs font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-70",
                          selected && row.teamLocked ? "border-fairway-800 bg-fairway-800 text-white" : "",
                          selected && !row.teamLocked && team === "maroon" ? "border-maroon-700 bg-maroon-700 text-white" : "",
                          selected && !row.teamLocked && team === "white" ? "border-ink-400 bg-white text-ink-900" : "",
                          selected && !row.teamLocked && team === null ? "border-ink-500 bg-ink-100 text-ink-800" : "",
                          !selected ? "border-ink-200 bg-white text-ink-500 hover:border-ink-400" : "",
                        ].join(" ")}
                      >
                        {label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={busy === row.playerSlug}
                    onClick={() => handleTeamLock(row.playerSlug, !row.teamLocked)}
                    title={row.teamLocked ? "Unlock team assignment" : "Lock team assignment"}
                    className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-sm border border-ink-300 bg-white text-ink-700 hover:border-gold-500 hover:text-maroon-700 disabled:opacity-50"
                  >
                    {row.teamLocked ? <LockKeyhole size={14} /> : <LockKeyholeOpen size={14} />}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
