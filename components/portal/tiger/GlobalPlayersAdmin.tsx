"use client";

import { Fragment, useState } from "react";

// Mirrors EDITABLE_PLAYER_FIELDS in lib/data/players/overrides.ts. Not
// imported from there directly: that module has a top-level import of the
// server-only Supabase client (via next/headers), which breaks the client
// bundle for this "use client" component. Keep this list in sync with
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

export interface GlobalPlayerRow {
  playerSlug: string;
  fullName: string;
  username: string | null;
  claimedBy: string | null;
  email: string | null;
  pendingEdits: PendingProfileEdit[];
}

export function GlobalPlayersAdmin({ rows: initialRows }: { rows: GlobalPlayerRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [rows, setRowsState] = useState(initialRows);
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const [addingPlayer, setAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerEmail, setNewPlayerEmail] = useState("");
  const [addPlayerBusy, setAddPlayerBusy] = useState(false);

  async function handleAddPlayer() {
    setAddPlayerBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/player-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: newPlayerName, email: newPlayerEmail }),
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
      setAddPlayerBusy(false);
    }
  }

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

  async function handleSaveNameAndEmail(playerSlug: string) {
    setBusy(playerSlug);
    setError(null);
    try {
      // Each request is judged on its own: one half can save while the other
      // fails, and the row must never contradict what is actually on file.
      // An unchanged name is not sent: saving only an email must not pin a
      // hand-written player's current name into player_slots.full_name, which
      // would stop later edits to their hand-written file from showing.
      const currentRow = rows.find((r) => r.playerSlug === playerSlug);
      const [nameResult, emailResult] = await Promise.allSettled([
        currentRow && editName.trim() === currentRow.fullName
          ? Promise.resolve({ ok: true, fullName: currentRow.fullName })
          : fetch("/api/portal/tiger/player-name", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ playerSlug, fullName: editName }),
            }).then((res) => res.json()),
        fetch("/api/portal/tiger/player-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerSlug, email: editEmail }),
        }).then((res) => res.json()),
      ]);
      const nameData = nameResult.status === "fulfilled" ? nameResult.value : null;
      const emailData = emailResult.status === "fulfilled" ? emailResult.value : null;
      const nameSaved = Boolean(nameData?.ok);
      const emailSaved = Boolean(emailData?.ok);

      // Apply whichever half actually saved, so the row matches the database.
      if (nameSaved || emailSaved) {
        setRowsState((current) =>
          current.map((r) =>
            r.playerSlug === playerSlug
              ? {
                  ...r,
                  ...(nameSaved ? { fullName: nameData.fullName } : {}),
                  ...(emailSaved ? { email: emailData.email } : {}),
                }
              : r
          )
        );
      }

      if (nameSaved && emailSaved) {
        setEditSlug(null);
        return;
      }

      const problems: string[] = [];
      if (!nameSaved) problems.push(`Name not saved: ${nameData?.error ?? "something went wrong."}`);
      if (!emailSaved) problems.push(`Email not saved: ${emailData?.error ?? "something went wrong."}`);
      setError(problems.join(" "));
    } finally {
      setBusy(null);
    }
  }

  // Always sends to whatever email is on file for this player (set via
  // "Edit name & email" above) — there's deliberately no separate address
  // to type here, so the invite can never go somewhere different from
  // what's on record.
  async function handleSendInvite(playerSlug: string) {
    setBusy(playerSlug);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/invite", {
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

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">Players</h1>
          <p className="mt-2 font-sans text-sm text-ink-500">
            Add players, invite them, edit their name/email, and review any bio edits waiting on your approval.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAddingPlayer((current) => !current);
            setNewPlayerName("");
            setNewPlayerEmail("");
            setError(null);
          }}
          className="shrink-0 rounded-pill bg-maroon-700 px-4 py-2 font-condensed text-xs font-bold uppercase tracking-wide text-white"
        >
          + Add Player
        </button>
      </div>
      {addingPlayer && (
        <div className="mt-4 rounded-sm border border-ink-200 bg-cream-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              required
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder="Full name"
              className="flex-1 rounded-sm border border-ink-200 px-2 py-1 font-sans text-xs"
            />
            <input
              type="email"
              required
              value={newPlayerEmail}
              onChange={(e) => setNewPlayerEmail(e.target.value)}
              placeholder="player@email.com"
              className="flex-1 rounded-sm border border-ink-200 px-2 py-1 font-sans text-xs"
            />
            <button
              type="button"
              disabled={addPlayerBusy || !newPlayerName.trim() || !newPlayerEmail.trim()}
              onClick={handleAddPlayer}
              className="rounded-pill bg-maroon-700 px-3 py-1.5 font-sans text-xs font-semibold text-white disabled:opacity-50"
            >
              {addPlayerBusy ? "Adding…" : "Add Player"}
            </button>
          </div>
        </div>
      )}
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
            <Fragment key={row.playerSlug}>
              <tr className="border-b border-ink-100">
                <td className="py-4">
                  {row.fullName}
                  <div className="mt-1 flex flex-col gap-0.5 font-sans text-2xs text-ink-400">
                    <span>{row.email ?? "No email on file"}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditSlug((current) => (current === row.playerSlug ? null : row.playerSlug));
                        setEditName(row.fullName);
                        setEditEmail(row.email ?? "");
                        setError(null);
                      }}
                      className="self-start font-semibold text-maroon-700 underline"
                    >
                      Edit name & email
                    </button>
                  </div>
                </td>
                <td className="py-4 font-mono">{row.username ?? "—"}</td>
                <td className="py-4">{row.claimedBy ? "Claimed" : "Open"}</td>
                <td className="py-4 text-right">
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
                      disabled={busy === row.playerSlug || !row.email}
                      title={row.email ? undefined : "Add an email first"}
                      onClick={() => handleSendInvite(row.playerSlug)}
                      className="font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline disabled:cursor-not-allowed disabled:text-ink-300"
                    >
                      {busy === row.playerSlug ? "Sending…" : "Send Invite"}
                    </button>
                  ) : null}
                </td>
              </tr>
              {editSlug === row.playerSlug && (
                <tr key={`${row.playerSlug}-edit`} className="border-b border-ink-100 bg-cream-50">
                  <td colSpan={4} className="py-3">
                    <div className="flex flex-wrap items-center gap-2 px-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Full name"
                        className="flex-1 rounded-sm border border-ink-200 px-2 py-1 font-sans text-xs"
                      />
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="player@email.com"
                        className="flex-1 rounded-sm border border-ink-200 px-2 py-1 font-sans text-xs"
                      />
                      <button
                        type="button"
                        disabled={busy === row.playerSlug || !editName.trim()}
                        onClick={() => handleSaveNameAndEmail(row.playerSlug)}
                        className="rounded-pill bg-maroon-700 px-3 py-1.5 font-sans text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {busy === row.playerSlug ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {expandedSlug === row.playerSlug && row.pendingEdits.length > 0 && (
                <tr key={`${row.playerSlug}-pending`} className="border-b border-ink-100 bg-cream-50">
                  <td colSpan={4} className="py-3">
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
                  <td colSpan={4} className="py-3">
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
