"use client";

import { Fragment, useState } from "react";
import { EDITABLE_PLAYER_FIELDS } from "@/lib/data/players/overrides";

interface PendingProfileEdit {
  field: string;
  proposedValue: string | string[];
  submittedAt: string;
}

export interface PlayerSlotAdminRow {
  playerSlug: string;
  fullName: string;
  username: string | null;
  claimedBy: string | null;
  team: "maroon" | "white" | null;
  pendingEdits: PendingProfileEdit[];
}

export function PlayerSlotsAdmin({ rows: initialRows }: { rows: PlayerSlotAdminRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [rows, setRowsState] = useState(initialRows);

  async function handleApprove(playerSlug: string, field: string) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/profile-edits/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug, field }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setRowsState((current) =>
        current.map((r) => (r.playerSlug === playerSlug ? { ...r, pendingEdits: r.pendingEdits.filter((e) => e.field !== field) } : r))
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleDeny(playerSlug: string, field: string) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/profile-edits/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug, field }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setRowsState((current) =>
        current.map((r) => (r.playerSlug === playerSlug ? { ...r, pendingEdits: r.pendingEdits.filter((e) => e.field !== field) } : r))
      );
    } finally {
      setBusy(null);
    }
  }

  const [directEditSlug, setDirectEditSlug] = useState<string | null>(null);
  const [directEditField, setDirectEditField] = useState("bio");
  const [directEditValue, setDirectEditValue] = useState("");
  const [directEditSaved, setDirectEditSaved] = useState(false);

  async function handleSet(playerSlug: string) {
    setBusy(playerSlug);
    setError(null);
    setDirectEditSaved(false);
    try {
      const res = await fetch("/api/portal/tiger/profile-edits/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerSlug,
          field: directEditField,
          value: directEditField === "history" ? directEditValue.split("\n").map((line) => line.trim()).filter(Boolean) : directEditValue,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      // A direct set also clears any pending edit for that field server-side.
      setRowsState((current) =>
        current.map((r) =>
          r.playerSlug === playerSlug ? { ...r, pendingEdits: r.pendingEdits.filter((e) => e.field !== directEditField) } : r
        )
      );
      setDirectEditSaved(true);
      setDirectEditValue("");
    } finally {
      setBusy(null);
    }
  }

  async function handleCopyLink(playerSlug: string, username: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/signup?code=${username}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedSlug(playerSlug);
      setTimeout(() => setCopiedSlug((current) => (current === playerSlug ? null : current)), 2000);
    } catch {
      // Clipboard access can fail (permissions, non-secure context) — the
      // link is still visible in the row for manual copying if needed.
    }
  }

  async function handleUnlink(playerSlug: string) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/admin/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug }),
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

  async function handleSetTeam(playerSlug: string, team: "maroon" | "white") {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug, team }),
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

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Players & Teams</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">
        Invite players, assign each one to Maroon or White, and review any bio edits waiting on your approval.
      </p>
      {error && <p className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      <table className="mt-6 w-full border-collapse font-sans text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left">
            <th className="py-2">Player</th>
            <th className="py-2">Username</th>
            <th className="py-2">Status</th>
            <th className="py-2">Team</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.playerSlug} className="border-b border-ink-100">
              <td className="py-2">{row.fullName}</td>
              <td className="py-2 font-mono">{row.username ?? "—"}</td>
              <td className="py-2">{row.claimedBy ? "Claimed" : "Open"}</td>
              <td className="py-2">
                <select
                  value={row.team ?? ""}
                  disabled={busy === row.playerSlug}
                  onChange={(e) => handleSetTeam(row.playerSlug, e.target.value as "maroon" | "white")}
                  className="border-2 border-stone-300 rounded-lg px-2 py-1 text-xs font-semibold bg-white"
                >
                  <option value="" disabled>
                    Unassigned
                  </option>
                  <option value="maroon">Maroon</option>
                  <option value="white">White</option>
                </select>
              </td>
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
                ) : row.username ? (
                  <button
                    type="button"
                    onClick={() => handleCopyLink(row.playerSlug, row.username!)}
                    className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                  >
                    {copiedSlug === row.playerSlug ? "Copied!" : "Copy Invite Link"}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
