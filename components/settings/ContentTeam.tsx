"use client";
import { useState } from "react";
import { formatWhen, type PostCounts } from "@/lib/content/ribbon";
import type { ContentTeamMember } from "@/lib/content/ribbonSample";
import settings from "./Settings.module.css";
import styles from "./ContentTeam.module.css";

export type ContentTeamRow = ContentTeamMember & { counts: PostCounts };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Settings → Content team (Admins only): invite a Poster by username / email or with a one-time link, then each Poster
 * with their status, who invited them, and how much they've posted. Remove takes access away at once; counts stay.
 */
export function ContentTeam({ initial, sample = false }: { initial: ContentTeamRow[]; sample?: boolean }) {
  const [rows, setRows] = useState(initial);
  const [how, setHow] = useState<"account" | "link">("account");
  const [who, setWho] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const empty: PostCounts = { published: 0, waiting: 0, sentBack: 0, lastPublishedAt: null };

  function invite() {
    setError(null); setMessage(null);
    const name = who.trim().replace(/^@/, "");
    if (!name) return setError("Type their username or email.");
    if (rows.some((r) => r.username === name && r.status !== "removed")) return setError(`@${name} is already on the team or invited.`);
    // Sample: any name works. Saved version: the server looks the account up and refuses unknown names.
    setRows((list) => [{ profileId: `invited-${name}`, name, username: name, status: "invited", invitedBy: "You", invitedAt: new Date().toISOString(), counts: empty }, ...list]);
    setWho(""); setMessage(`Invite sent. @${name} will see it next time they open the app.`);
  }
  function makeLink() {
    setError(null); setMessage(null);
    // Sample only: a made-up code. Saved version: the server makes a one-time code and keeps only its hash.
    setLink(`${window.location.origin}/join-team/${Math.random().toString(36).slice(2, 10)}`);
  }
  function remove(id: string) {
    setRows((list) => list.map((r) => r.profileId === id ? { ...r, status: "removed" } : r));
    setConfirm(null); setMessage("Removed. They can't post anymore.");
  }
  const cancel = (id: string) => { setRows((list) => list.filter((r) => r.profileId !== id)); setMessage("Invite cancelled."); };

  const current = rows.filter((r) => r.status !== "removed");
  const past = rows.filter((r) => r.status === "removed");
  return <>
    <section className={settings.card} aria-labelledby="team-invite">
      <h2 id="team-invite" className={settings.cardTitle}>Invite a Poster</h2>
      <p className={settings.text}><span className={settings.muted}>Posters write posts and trip plans. You or Cade approve each one before it goes live.</span></p>
      <div className={settings.segmented} role="group" aria-label="How to invite" style={{ marginTop: 12 }}>
        <button type="button" aria-pressed={how === "account"} onClick={() => setHow("account")}>Has an account</button>
        <button type="button" aria-pressed={how === "link"} onClick={() => setHow("link")}>Invite link</button>
      </div>
      {how === "account" ? <div className={styles.inviteRow}>
        <label className="sr-only" htmlFor="team-who">Username or email</label>
        <input id="team-who" className={settings.fieldInput} placeholder="@username or email" value={who} onChange={(e) => setWho(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") invite(); }} />
        <button type="button" className={settings.primary} onClick={invite}>Invite</button>
      </div> : <div className={styles.linkBox}>
        {link ? <>
          <code className={styles.link}>{link}</code>
          <button type="button" className={settings.secondary} onClick={() => { navigator.clipboard?.writeText(link).then(() => setMessage("Link copied. Text it to them."), () => setMessage("Press and hold the link to copy it.")); }}>Copy link</button>
          <p className={settings.note}>Works once and stops working in 7 days.</p>
        </> : <button type="button" className={settings.primary} onClick={makeLink}>Create invite link</button>}
      </div>}
      {error && <p className={settings.error} role="alert" style={{ marginTop: 8 }}>{error}</p>}
      {message && <p className={settings.note} role="status" style={{ marginTop: 8 }}>{message}</p>}
    </section>

    <section className={settings.card} aria-labelledby="team-list">
      <h2 id="team-list" className={settings.cardTitle}>Posters</h2>
      {!current.length && <p className={settings.text}><span className={settings.muted}>No Posters yet.</span></p>}
      <ul className={styles.list}>{current.map((row) => <li key={row.profileId} className={styles.row}>
        <div className={styles.rowHead}>
          <div className={styles.who}><b>{row.name}</b><span>@{row.username}</span></div>
          <span className={styles.status} data-status={row.status}>{row.status === "active" ? "Active" : "Invited"}</span>
        </div>
        <p className={styles.meta}>Invited by {row.invitedBy} · {day(row.invitedAt)}</p>
        {row.status === "active" && <p className={styles.counts}>
          <span><b>{row.counts.published}</b> published</span><span><b>{row.counts.waiting}</b> waiting</span><span><b>{row.counts.sentBack}</b> sent back</span>
        </p>}
        {row.status === "active" && <p className={styles.meta}>{row.counts.lastPublishedAt ? `Last post: ${formatWhen(row.counts.lastPublishedAt)}` : "No posts live yet"}</p>}
        <div className={styles.actions}>
          {row.status === "invited" ? <button type="button" className={settings.editButton} onClick={() => cancel(row.profileId)}>Cancel invite</button>
            : confirm === row.profileId ? <>
              <span className={styles.ask}>Remove {row.name}? They lose access right away.</span>
              <button type="button" className={settings.editButton} onClick={() => setConfirm(null)}>Keep</button>
              <button type="button" className={`${settings.editButton} ${styles.danger}`} onClick={() => remove(row.profileId)}>Remove</button>
            </> : <button type="button" className={settings.editButton} onClick={() => setConfirm(row.profileId)}>Remove</button>}
        </div>
      </li>)}</ul>
    </section>

    {past.length > 0 && <section className={settings.card} aria-labelledby="team-past">
      <h2 id="team-past" className={settings.cardTitle}>Past Posters</h2>
      <ul className={styles.list}>{past.map((row) => <li key={row.profileId} className={styles.row}>
        <div className={styles.rowHead}><div className={styles.who}><b>{row.name}</b><span>@{row.username}</span></div><span className={styles.status} data-status="removed">Removed</span></div>
        <p className={styles.counts}><span><b>{row.counts.published}</b> published</span></p>
      </li>)}</ul>
    </section>}
    {sample && <p className={styles.sample}>Sample data · nothing here is saved or sent.</p>}
  </>;
}
