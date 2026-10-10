"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card } from "./GolfTripHome";
import type { SavedGolfTrip } from "@/lib/platform/golfTripCreate";
import { golfTripInvitePath } from "@/lib/platform/golfTripInvitations";
import { acceptedMembers, memberState, type MemberState } from "@/lib/platform/golfTripMembers";
import { profileHref } from "@/lib/profile/profileEdit";
import home from "./GolfTripHome.module.css";
import fields from "./CreateTournament.module.css";
import styles from "./GolfTripMembers.module.css";

type Member = SavedGolfTrip["members"][number];
const BADGE: Record<MemberState, string> = { organizer: "Organizer", accepted: "Member", pending: "Invited", declined: "Declined" };
type Reply = { ok?: boolean; error?: string; inviteToken?: string; url?: string } | null;

async function send(url: string, method: "POST" | "DELETE", body?: unknown): Promise<Reply & { httpOk: boolean }> {
  try {
    const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const reply = await response.json().catch(() => null) as Reply;
    return { ...reply, httpOk: response.ok && Boolean(reply?.ok) };
  } catch {
    return { ok: false, error: "We couldn't reach the server. Check your connection and try again.", httpOk: false };
  }
}

/**
 * Trip Settings → Members. Everyone sees who's on the trip and who's only invited (names only; the server sends
 * emails to the organizer alone). With `manage` (the organizer's tab): invite someone, copy / renew their invite link,
 * cancel an invitation, remove a member. Pending and declined invitations are never players.
 */
export function GolfTripMembers({ tripId, members, viewerMemberId, manage }: { tripId: string; members: Member[]; viewerMemberId: string; manage: boolean }) {
  const router = useRouter();
  const [link, setLink] = useState<{ memberId: string; name: string; url: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const showLink = (memberId: string, name: string, token: string) =>
    setLink({ memberId, name, url: new URL(golfTripInvitePath(token), window.location.origin).href });

  async function renew(member: Member) {
    setBusy(member.id);
    setMessage("");
    const reply = await send(`/api/golf-trips/${tripId}/members/${member.id}/link`, "POST");
    setBusy(null);
    if (reply.httpOk && reply.inviteToken) {
      showLink(member.id, member.displayName, reply.inviteToken);
      router.refresh();
    } else setMessage(reply.error ?? "We couldn't make a new link. Try again.");
  }

  async function remove(member: Member) {
    setBusy(member.id);
    setMessage("");
    const reply = await send(`/api/golf-trips/${tripId}/members/${member.id}`, "DELETE");
    setBusy(null);
    setConfirming(null);
    if (reply.httpOk) {
      if (link?.memberId === member.id) setLink(null);
      setMessage(memberState(member) === "accepted" ? `${member.displayName} was removed from the trip.` : `${member.displayName}'s invitation was cancelled.`);
      router.refresh();
    } else setMessage(reply.error ?? "We couldn't do that. Try again.");
  }

  const players = acceptedMembers(members).length;
  const invited = members.filter((m) => memberState(m) === "pending").length;
  return <Card title="Members">
    <p className={home.settingsNote}>{players} {players === 1 ? "player" : "players"}{invited ? ` · ${invited} invited` : ""}</p>
    <ul className={styles.list} aria-label="Trip members">
      {members.map((member) => {
        const state = memberState(member);
        const isYou = member.id === viewerMemberId;
        const unaccepted = state === "pending" || state === "declined";
        // Only a member who accepted with a real profile links to it — never an invitation.
        const href = !unaccepted ? profileHref(member.username) : null;
        return <li key={member.id} className={styles.member}>
          <div className={styles.who}>
            {href ? <Link href={href} className={styles.name}>{member.displayName}</Link> : <span className={styles.name}>{member.displayName}</span>}
            <span className={`${styles.badge} ${styles[state]}`}>{BADGE[state]}</span>
            {isYou && <span className={styles.you}>You</span>}
          </div>
          {manage && member.email && !isYou && <p className={styles.email}>{member.email}</p>}
          {manage && !isYou && state !== "organizer" && (confirming === member.id
            ? <div className={home.confirm} role="alertdialog" aria-label={unaccepted ? `Cancel ${member.displayName}'s invitation?` : `Remove ${member.displayName}?`}>
              <p className={home.text}>{unaccepted
                ? `Cancel ${member.displayName}'s invitation? Their link will stop working.`
                : `Remove ${member.displayName} from the trip? Their flights on this trip are removed too.`}</p>
              <div className={home.confirmActions}>
                <button type="button" className={home.cancelButton} onClick={() => setConfirming(null)} disabled={busy === member.id}>Keep</button>
                <button type="button" className={home.deleteButton} onClick={() => remove(member)} disabled={busy === member.id}>{unaccepted ? "Cancel invite" : "Remove"}</button>
              </div>
            </div>
            : <div className={styles.actions}>
              {unaccepted && <button type="button" className={styles.smallButton} onClick={() => renew(member)} disabled={busy === member.id}>
                {state === "declined" ? "Invite again" : "New invite link"}</button>}
              <button type="button" className={`${styles.smallButton} ${styles.smallDanger}`} onClick={() => { setConfirming(member.id); setMessage(""); }} disabled={busy === member.id}>
                {unaccepted ? "Cancel invite" : "Remove"}</button>
            </div>)}
          {link?.memberId === member.id && <InviteLink name={link.name} url={link.url} />}
        </li>;
      })}
    </ul>
    {manage && <InviteForm tripId={tripId} onInvited={(memberId, name, token) => { showLink(memberId, name, token); router.refresh(); }} />}
    {link && !members.some((m) => m.id === link.memberId) && <InviteLink name={link.name} url={link.url} />}
    {message && <p className={home.settingsMessage} role="status">{message}</p>}
  </Card>;
}

/** The invite link, shown once after it's made (only a fingerprint of it is stored, so it can't be shown again later). */
function InviteLink({ name, url }: { name: string; url: string }) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  }
  return <div className={styles.link} role="group" aria-label={`Invite link for ${name}`}>
    <p className={styles.linkTitle}>Invite link for {name}</p>
    <input className={styles.linkText} readOnly value={url} aria-label="Invite link" onFocus={(event) => event.currentTarget.select()} />
    <div className={styles.actions}>
      <button type="button" className={styles.smallButton} onClick={copy}>{copied === "yes" ? "Copied" : "Copy invite link"}</button>
    </div>
    <p className={home.settingsNote}>{copied === "failed" ? "Couldn't copy — select the link above and copy it." : "Send this link to them. It's shown only now; if it's lost, make a new one."}</p>
  </div>;
}

function InviteForm({ tripId, onInvited }: { tripId: string; onInvited: (memberId: string, name: string, token: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const displayName = String(data.get("displayName") ?? "").trim();
    setBusy(true);
    setError("");
    const reply = await send(`/api/golf-trips/${tripId}/members`, "POST", { displayName, email: String(data.get("email") ?? "") });
    setBusy(false);
    const memberId = (reply as { memberId?: string }).memberId;
    if (reply.httpOk && reply.inviteToken && memberId) {
      form.reset();
      onInvited(memberId, displayName, reply.inviteToken);
    } else setError(reply.error ?? "We couldn't send that invite. Try again.");
  }

  return <form className={styles.form} onSubmit={submit} aria-label="Invite member">
    <h3 className={styles.formTitle}>Invite member</h3>
    <label className={fields.field}>
      <span className={fields.fieldLabel}>Name</span>
      <input className={fields.input} name="displayName" required maxLength={120} autoComplete="off" />
    </label>
    <label className={fields.field}>
      <span className={fields.fieldLabel}>Email (optional)</span>
      <input className={fields.input} name="email" type="email" maxLength={200} autoComplete="off" />
    </label>
    <button type="submit" className={styles.smallButton} disabled={busy}>{busy ? "Creating…" : "Create invite link"}</button>
    {error && <p className={home.settingsMessage} role="alert">{error}</p>}
  </form>;
}

/** A normal member leaves the trip (the organizer deletes the trip instead). */
export function LeaveGolfTrip({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function leave() {
    setBusy(true);
    setMessage("");
    const reply = await send(`/api/golf-trips/${tripId}/leave`, "POST");
    if (reply.httpOk) {
      router.replace(reply.url ?? "/golf-trips");
      router.refresh();
      return;
    }
    setBusy(false);
    setConfirming(false);
    setMessage(reply.error ?? "We couldn't take you off the trip. Try again.");
  }

  return <Card title="Leave trip">
    <p className={home.settingsNote}>Take yourself off this trip. Your flights on it are removed; your account and profile stay.</p>
    {confirming
      ? <div className={home.confirm} role="alertdialog" aria-label="Leave this trip?">
        <p className={home.text}>Leave this trip? You&apos;ll need a new invite to rejoin.</p>
        <div className={home.confirmActions}>
          <button type="button" className={home.cancelButton} onClick={() => setConfirming(false)} disabled={busy}>Stay</button>
          <button type="button" className={home.deleteButton} onClick={leave} disabled={busy}>{busy ? "Leaving…" : "Leave"}</button>
        </div>
      </div>
      : <button type="button" className={home.dangerButton} onClick={() => { setConfirming(true); setMessage(""); }}>Leave Trip</button>}
    {message && <p className={home.settingsMessage} role="status">{message}</p>}
  </Card>;
}
