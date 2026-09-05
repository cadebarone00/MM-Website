"use client";

import { Fragment, useState } from "react";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";

// Mirrors EDITABLE_PLAYER_FIELDS in lib/data/players/overrides.ts. Not
// imported from there directly: that module has a top-level import of the
// server-only Supabase client (via next/headers), which breaks the client
// bundle for this "use client" component — the same constraint
// ProfileEditGrid.tsx (Task 9) works around by keeping its own local field
// list instead of importing from overrides.ts. Keep this list in sync with
// overrides.ts if editable fields ever change.
const EDITABLE_PLAYER_FIELDS = [
  "bio",
  "history",
  "instagram",
  "linkedin",
  "nickname",
  "classYear",
  "major",
  "occupation",
  "hometown",
  "residence",
  "playsFrom",
  "status",
  "clubGolfYears",
  "college",
  "height",
  "weight",
  "age",
  "birthday",
  "handicap",
  "rankingNotes",
  "debut",
  "debutLocation",
  "strengths",
  "careerHighlights",
  "personal",
  "hobbies",
  "goals",
  "misc",
] as const;

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
  teamLocked: boolean;
  pendingEdits: PendingProfileEdit[];
}

export function PlayerSlotsAdmin({ year, rows: initialRows }: { year: number; rows: PlayerSlotAdminRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [rows, setRowsState] = useState(initialRows);

  async function handleApprove(playerSlug: string, field: string, submittedAt: string) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/profile-edits/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug, field, submittedAt }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setRowsState((current) =>
        current.map((r) => (r.playerSlug === playerSlug ? { ...r, pendingEdits: r.pendingEdits.filter((e) => e.field !== field) } : r))
      );
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeny(playerSlug: string, field: string, submittedAt: string) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/profile-edits/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerSlug, field, submittedAt }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setRowsState((current) =>
        current.map((r) => (r.playerSlug === playerSlug ? { ...r, pendingEdits: r.pendingEdits.filter((e) => e.field !== field) } : r))
      );
    } catch {
      setError("Something went wrong — try again.");
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
    } catch {
      setError("Something went wrong — try again.");
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
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(null);
    }
  }

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
      setRowsState((current) => current.map((row) => row.playerSlug === playerSlug ? { ...row, teamLocked: locked } : row));
    } catch {
      setError("Something went wrong â€” try again.");
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
            <Fragment key={row.playerSlug}>
              <tr className="border-b border-ink-100">
                <td className="py-2">{row.fullName}</td>
                <td className="py-2 font-mono">{row.username ?? "—"}</td>
                <td className="py-2">{row.claimedBy ? "Claimed" : "Open"}</td>
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
                <td className="py-2 text-right">
                  {row.pendingEdits.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedSlug((current) => (current === row.playerSlug ? null : row.playerSlug))}
                      className="mr-3 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                    >
                      {row.pendingEdits.length} pending
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDirectEditSlug((current) => (current === row.playerSlug ? null : row.playerSlug));
                      setDirectEditSaved(false);
                      setError(null);
                    }}
                    className="mr-3 font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500 underline"
                  >
                    Edit directly
                  </button>
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
              {expandedSlug === row.playerSlug && row.pendingEdits.length > 0 && (
                <tr key={`${row.playerSlug}-pending`} className="border-b border-ink-100 bg-cream-50">
                  <td colSpan={5} className="py-3">
                    <div className="flex flex-col gap-2 px-2">
                      {row.pendingEdits.map((edit) => (
                        <div key={edit.field} className="flex items-center justify-between gap-3 font-sans text-xs">
                          <span className="font-semibold text-ink-900">{edit.field}</span>
                          <span className="flex-1 text-ink-500">
                            → {Array.isArray(edit.proposedValue) ? edit.proposedValue.join(", ") : edit.proposedValue}
                          </span>
                          <button
                            type="button"
                            disabled={busy === row.playerSlug}
                            onClick={() => handleApprove(row.playerSlug, edit.field, edit.submittedAt)}
                            className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy === row.playerSlug}
                            onClick={() => handleDeny(row.playerSlug, edit.field, edit.submittedAt)}
                            className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500 underline"
                          >
                            Deny
                          </button>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              {directEditSlug === row.playerSlug && (
                <tr key={`${row.playerSlug}-direct-edit`} className="border-b border-ink-100 bg-cream-50">
                  <td colSpan={5} className="py-3">
                    <div className="flex flex-col gap-2 px-2">
                      {directEditSaved && <p className="font-sans text-xs text-ink-700">Saved — live immediately, no approval needed.</p>}
                      <div className="flex items-center gap-2">
                        <select
                          value={directEditField}
                          onChange={(e) => setDirectEditField(e.target.value)}
                          className="border-2 border-stone-300 rounded-lg px-2 py-1 text-xs font-semibold bg-white"
                        >
                          {EDITABLE_PLAYER_FIELDS.map((field) => (
                            <option key={field} value={field}>
                              {field}
                            </option>
                          ))}
                        </select>
                        <textarea
                          value={directEditValue}
                          onChange={(e) => setDirectEditValue(e.target.value)}
                          placeholder={directEditField === "history" ? "One entry per line" : "New value"}
                          rows={2}
                          className="flex-1 rounded-sm border border-ink-200 px-2 py-1 font-sans text-xs"
                        />
                        <button
                          type="button"
                          disabled={busy === row.playerSlug}
                          onClick={() => handleSet(row.playerSlug)}
                          className="rounded-pill bg-maroon-700 px-3 py-1.5 font-sans text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
