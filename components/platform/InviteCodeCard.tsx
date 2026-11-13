"use client";

import { useState } from "react";
import { Check, Copy, Mail, RefreshCw, Share2 } from "lucide-react";
import { formatCode } from "@/lib/platform/codeTournaments";
import { emailsFrom, joinPath, KIND_NAME, type InviteKind } from "@/lib/platform/codeInvites";
import { shareOrigin } from "@/lib/app/shareOrigin";
import styles from "./InviteCodeCard.module.css";

type SendReply = { ok: boolean; sent?: number; skipped?: number; notConfigured?: boolean; message?: string };

/**
 * The same invite card on rounds, trips and leagues (project_specs.md, "Feature: One way to join everything"): the
 * 6-character code, Copy code, Share (the phone's share sheet, with a link to this kind's Join page) and — for whoever
 * runs it — Email the code (type addresses; each gets "<sender> invited you to <name>" with the code and a Join button).
 * `onNewCode`: the organizer can replace the code (the old one stops working).
 */
export function InviteCodeCard({ kind, id, code, name, canEmail, onNewCode }: { kind: InviteKind; id: string; code: string; name: string; canEmail: boolean; onNewCode?: () => Promise<void> }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [emailing, setEmailing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);
  const shown = formatCode(code);
  const link = `${shareOrigin()}${joinPath(kind, code)}`;
  const emails = emailsFrom(text);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const copy = (value: string, what: "code" | "link") => navigator.clipboard?.writeText(value).then(() => { setCopied(what); window.setTimeout(() => setCopied(null), 1800); }).catch(() => {});

  async function send() {
    if (!emails.length) return;
    setBusy(true); setNote(null);
    const reply = await fetch("/api/invites/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, emails }) })
      .then((r) => r.json() as Promise<SendReply>).catch(() => null);
    setBusy(false);
    if (!reply) { setNote({ text: "No connection. Try again when you're back online.", good: false }); return; }
    if (!reply.ok) { setNote({ text: reply.message ?? "Couldn't send the emails. Try again.", good: false }); return; }
    if (reply.notConfigured) { setNote({ text: "Email isn't set up yet. Copy or share the code instead.", good: false }); return; }
    const sent = reply.sent ?? 0, skipped = reply.skipped ?? 0;
    setNote({ text: `${sent} ${sent === 1 ? "invite" : "invites"} sent.${skipped ? ` ${skipped} skipped (already emailed in the last hour, or over the limit).` : ""}`, good: sent > 0 });
    if (sent) setText("");
  }

  return <section className={styles.card} aria-label="Invite code">
    <p className={styles.label}>Invite code</p>
    <p className={styles.code} aria-label={`Invite code ${shown.split("").join(" ")}`}>{shown}</p>
    <p className={styles.hint}>Anyone with the code can join this {KIND_NAME[kind]}.</p>
    <div className={styles.actions}>
      <button type="button" onClick={() => copy(shown, "code")}>{copied === "code" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copied === "code" ? "Copied" : "Copy code"}</button>
      {canShare ? <button type="button" onClick={() => navigator.share({ title: name, text: `Join ${name} on The Maroon: code ${shown}`, url: link }).catch(() => {})}><Share2 size={15} aria-hidden="true" /> Share</button>
        : <button type="button" onClick={() => copy(link, "link")}>{copied === "link" ? <Check size={15} aria-hidden="true" /> : <Share2 size={15} aria-hidden="true" />} {copied === "link" ? "Link copied" : "Copy link"}</button>}
      {canEmail && <button type="button" aria-expanded={emailing} onClick={() => { setEmailing(!emailing); setNote(null); }}><Mail size={15} aria-hidden="true" /> Email the code</button>}
      {onNewCode && <button type="button" onClick={() => { if (window.confirm("Make a new code? The old one stops working.")) void onNewCode(); }}><RefreshCw size={15} aria-hidden="true" /> New code</button>}
    </div>
    {canEmail && emailing && <form className={styles.email} onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <label><span>Email addresses</span>
        <textarea rows={3} value={text} placeholder="name@example.com, friend@example.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setText(e.target.value)} /></label>
      <p className={styles.hint}>Separate them with commas or new lines (up to 50). Each person gets the code and a Join button.</p>
      <button type="submit" className={styles.send} disabled={busy || !emails.length}>{busy ? "Sending…" : emails.length ? `Send ${emails.length} ${emails.length === 1 ? "invite" : "invites"}` : "Send invites"}</button>
    </form>}
    {note && <p className={styles.note} data-good={note.good || undefined} role="status">{note.text}</p>}
  </section>;
}
