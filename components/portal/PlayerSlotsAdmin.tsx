"use client";

import { useState } from "react";

export interface PlayerSlotAdminRow {
  playerSlug: string;
  fullName: string;
  username: string | null;
  claimedBy: string | null;
}

export function PlayerSlotsAdmin({ rows }: { rows: PlayerSlotAdminRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Player Invitations</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">
        Each player&apos;s username is generated automatically. Copy their invite link and send it to them — clicking it takes them straight to sign-up with their username already filled in.
      </p>
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
              <td className="py-2 font-mono">{row.username ?? "—"}</td>
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
