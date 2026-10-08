"use client";

import { useState } from "react";
import base from "@/components/tournament-draft/TournamentDraftWorkspace.module.css";
import { tournamentPlayerInvitePath, type PlayerInviteStatus } from "@/lib/platform/tournamentPlayerInvitations";

const LABEL: Record<PlayerInviteStatus, string> = { joined: "Joined", invited: "Invited", declined: "Declined", none: "Not invited" };

/**
 * One saved player's invitation in the dashboard: their status, and (until they've joined) a link they open to attach
 * their own Maroon profile to this player. The link is shown once; making a new one replaces the old.
 */
export function PlayerInvite({ apiBase, playerId, name, status, onInvited }: {
  apiBase: string; playerId: string; name: string; status: PlayerInviteStatus | undefined; onInvited: () => void;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function makeLink() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${apiBase}/players/${playerId}/invite`, { method: "POST" });
      const reply = await response.json().catch(() => null) as { ok?: boolean; inviteToken?: string; error?: string } | null;
      if (response.ok && reply?.ok && reply.inviteToken) {
        setLink(new URL(tournamentPlayerInvitePath(reply.inviteToken), window.location.origin).href);
        onInvited();
      } else setMessage(reply?.error ?? "We couldn't make that invite. Try again.");
    } catch {
      setMessage("We couldn't reach the server. Try again.");
    }
    setBusy(false);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Copied.");
    } catch {
      setMessage("Couldn't copy — select the link and copy it.");
    }
  }

  return <div role="group" aria-label={`Invitation for ${name || "this player"}`} style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
    <span className={base.badge} data-status={status === "joined" ? "Complete" : undefined}>{status ? LABEL[status] : "…"}</span>
    {status !== "joined" && !link && <button type="button" className={base.textButton} onClick={makeLink} disabled={busy || status === undefined}>
      {busy ? "Making link…" : status === "invited" ? "New invite link" : "Make invite link"}</button>}
    {link && <>
      <input readOnly value={link} aria-label={`Invite link for ${name || "this player"}`} onFocus={(event) => event.currentTarget.select()} style={{ flex: "1 1 220px", minWidth: 0 }} />
      <button type="button" className={base.textButton} onClick={copy}>Copy invite link</button>
    </>}
    {message && <span className={base.muted} role="status">{message}</span>}
  </div>;
}
