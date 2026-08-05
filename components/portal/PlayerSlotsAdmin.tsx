"use client";

import { useState } from "react";

export interface PlayerSlotAdminRow {
  playerSlug: string;
  fullName: string;
  username: string | null;
  claimedBy: string | null;
}

export function PlayerSlotsAdmin({ rows }: { rows: PlayerSlotAdminRow[] }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(playerSlug: string) {
    setError(null);
    setBusy(playerSlug);
    try {
      const res = await fetch("/api/portal/admin/set-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug, username: drafts[playerSlug] }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  async function handleUnlink(playerSlug: string) {
    setBusy(playerSlug);
    try {
      await fetch("/api/portal/admin/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug }),
      });
      window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Player Usernames</h1>
      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <table className="mt-6 w-full border-collapse font-sans text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left">
            <th className="py-2">Player</th>
            <th className="py-2">Username</th>
            <th className="py-2">Status</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.playerSlug} className="border-b border-ink-100">
              <td className="py-2">{row.fullName}</td>
              <td className="py-2">
                {row.claimedBy ? (
                  <span>{row.username}</span>
                ) : (
                  <input
                    defaultValue={row.username ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [row.playerSlug]: e.target.value }))}
                    className="rounded-sm border border-ink-300 px-2 py-1 text-sm"
                  />
                )}
              </td>
              <td className="py-2">{row.claimedBy ? "Claimed" : "Open"}</td>
              <td className="py-2 text-right">
                {row.claimedBy ? (
                  <button
                    type="button"
                    disabled={busy === row.playerSlug}
                    onClick={() => handleUnlink(row.playerSlug)}
                    className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                  >
                    Unlink
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy === row.playerSlug}
                    onClick={() => handleSave(row.playerSlug)}
                    className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                  >
                    Save
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
