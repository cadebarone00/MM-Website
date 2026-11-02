"use client";
import { useState } from "react";
import { GolfTripActionSheet } from "../GolfTripActionSheet";
import { formatWhen, myDrafts, waitingForApproval, type ContentRole, type RibbonItem } from "@/lib/content/ribbon";
import { useRibbon } from "./RibbonProvider";
import { RibbonPostCard, StatusPill } from "./RibbonPostCard";
import { RibbonEditor } from "./RibbonEditor";
import { TripPromosPreview } from "./TripPreview";
import styles from "./Ribbon.module.css";

const SAMPLE_ROLES: { value: string; label: string; role: ContentRole }[] = [
  { value: "admin", label: "Admin (Cade / Cam)", role: "admin" },
  { value: "poster", label: "Poster (Jordan)", role: "poster" },
  { value: "invited", label: "Invited, not accepted", role: "invited" },
  { value: "player", label: "Everyone else", role: null },
];

/**
 * Top of the Play page for the content team: the gold bar (Admin or Poster / Player switch, plus Waiting for approval
 * or My drafts), the invite card for someone who's been invited, and the save messages.
 */
export function RibbonAdminBar() {
  const ribbon = useRibbon();
  const [queueOpen, setQueueOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  if (!ribbon) return null;
  const answer = async (accept: boolean) => setInviteError(await ribbon.answerInvite(accept));
  const { role, previewAsPlayer, sample, items, viewer } = ribbon;
  const team = role === "admin" || role === "poster";
  const queue = role === "admin" ? waitingForApproval(items) : role === "poster" && viewer.profileId ? myDrafts(items, viewer.profileId) : [];
  return <>
    {(team || sample) && <div className={styles.bar} role="region" aria-label="Content team">
      <span className={styles.barLabel}>{!team ? "Sample: you're seeing the page as a player"
        : previewAsPlayer ? "Player view · what everyone sees" : role === "admin" ? "Admin · you can edit this page" : "Poster · your posts need approval"}</span>
      {team && !previewAsPlayer && <button type="button" className={styles.queue} onClick={() => setQueueOpen(true)}>
        {role === "admin" ? "Waiting for approval" : "My drafts"} <b>{queue.length}</b></button>}
      {team && <div className={styles.seg} role="group" aria-label="View as">
        <button type="button" aria-pressed={!previewAsPlayer} onClick={() => ribbon.setPreviewAsPlayer(false)}>{role === "admin" ? "Admin" : "Poster"}</button>
        <button type="button" aria-pressed={previewAsPlayer} onClick={() => ribbon.setPreviewAsPlayer(true)}>Player</button>
      </div>}
      {sample && <label className={styles.sample}>Sample data · nothing is saved · Try as
        <select value={SAMPLE_ROLES.find((r) => r.role === role)?.value} onChange={(e) => ribbon.setSampleRole(SAMPLE_ROLES.find((r) => r.value === e.target.value)!.role)}>
          {SAMPLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select></label>}
    </div>}
    {role === "invited" && <div className={styles.invite} role="region" aria-label="Content team invite">
      <h2>You&apos;ve been invited to post on The Maroon</h2>
      <p>{ribbon.invitedBy ?? "An Admin"} invited you to the content team.</p>
      <div className={styles.inviteButtons}>
        <button type="button" className={styles.primary} style={{ gridColumn: "auto", flex: 1 }} onClick={() => answer(true)}>Accept</button>
        <button type="button" className={styles.button} style={{ flex: 1 }} onClick={() => answer(false)}>Decline</button>
      </div>
      {inviteError && <p className={styles.error} role="alert">{inviteError}</p>}
    </div>}
    {ribbon.toast && <div role="status" style={{ position: "fixed", left: "50%", top: "calc(56px + env(safe-area-inset-top, 0px))", transform: "translateX(-50%)", zIndex: 40, padding: "8px 16px", borderRadius: 999, border: "1px solid #b99c6b", background: "var(--color-maroon-950)", color: "#fffdf8", font: "600 14px var(--font-barlow), sans-serif", whiteSpace: "nowrap" }}>{ribbon.toast}</div>}
    {queueOpen && <RibbonQueue items={queue} admin={role === "admin"} onClose={() => setQueueOpen(false)} />}
  </>;
}

/** Admins: each waiting post with Approve & publish / Approve & schedule / Send back. Posters: their drafts and notes. */
function RibbonQueue({ items, admin, onClose }: { items: RibbonItem[]; admin: boolean; onClose: () => void }) {
  const ribbon = useRibbon()!;
  const [editing, setEditing] = useState<RibbonItem | null>(null);
  const [mode, setMode] = useState<{ id: string; kind: "schedule" | "back" } | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const title = admin ? "Waiting for approval" : "My drafts";
  async function confirm(item: RibbonItem) {
    setError(null);
    let failed: string | null;
    if (mode?.kind === "back") { if (!value.trim()) return setError("Write a short note so they know what to change."); failed = await ribbon.sendBack(item.id, value.trim()); }
    else { if (!value || new Date(value) <= new Date()) return setError("Pick a date and time in the future."); failed = await ribbon.approve(item.id, new Date(value).toISOString()); }
    if (failed) return setError(failed);
    setMode(null); setValue("");
  }
  const approveNow = async (id: string) => { setError(null); setError(await ribbon.approve(id)); };
  if (editing) return <RibbonEditor tab={editing.tab} kind={editing.kind} item={editing} onClose={() => setEditing(null)} />;
  return <GolfTripActionSheet label={title} onClose={onClose} className={styles.sheet}>
    <p className={styles.where}>Content team</p>
    <h2 className={styles.sheetTitle}>{title}</h2>
    {!items.length && <p className={styles.hint}>{admin ? "Nothing is waiting. New drafts from Posters show up here." : "No drafts. Tap Add on any tab to write one."}</p>}
    {items.map((item) => <div key={item.id} className={styles.queueItem}>
      {item.kind === "post" ? <RibbonPostCard post={item} /> : <TripPromosPreview trip={item.trip} />}
      <p className={styles.queueMeta}>{item.kind === "post" ? item.tab : "Explore · Featured trip"} · updated {formatWhen(item.updatedAt)}</p>
      {!admin && <div><StatusPill item={item} /></div>}
      {!admin && item.reviewNote && <p className={styles.note}>Sent back: “{item.reviewNote}”</p>}
      {mode?.id === item.id && <div className={styles.field}>
        {mode.kind === "back" ? <><label className={styles.label} htmlFor={`note-${item.id}`}>Note for the Poster</label>
          <textarea id={`note-${item.id}`} className={styles.input} value={value} placeholder="Use a brighter photo." onChange={(e) => setValue(e.target.value)} /></>
          : <><label className={styles.label} htmlFor={`when-${item.id}`}>Goes live on</label>
          <input id={`when-${item.id}`} className={styles.input} type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} /></>}
      </div>}
      {error && (mode?.id === item.id || !mode) && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.buttons}>
        {admin ? mode?.id === item.id ? <>
          <button type="button" className={styles.primary} onClick={() => confirm(item)}>{mode.kind === "back" ? "Send back" : "Approve & schedule"}</button>
          <button type="button" className={styles.button} style={{ gridColumn: "1/-1" }} onClick={() => { setMode(null); setError(null); }}>Cancel</button>
        </> : <>
          <button type="button" className={styles.primary} onClick={() => approveNow(item.id)}>Approve &amp; publish</button>
          <button type="button" className={styles.button} onClick={() => { setMode({ id: item.id, kind: "schedule" }); setValue(""); }}>Approve &amp; schedule</button>
          <button type="button" className={styles.button} onClick={() => { setMode({ id: item.id, kind: "back" }); setValue(""); }}>Send back</button>
          <button type="button" className={styles.button} style={{ gridColumn: "1/-1" }} onClick={() => setEditing(item)}>Open and edit</button>
        </> : <button type="button" className={styles.button} style={{ gridColumn: "1/-1" }} onClick={() => setEditing(item)}>{item.status === "pending" ? "Edit (stays waiting)" : "Edit"}</button>}
      </div>
    </div>)}
  </GolfTripActionSheet>;
}
