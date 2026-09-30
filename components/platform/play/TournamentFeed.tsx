"use client";

import { useState, type FormEvent } from "react";
import { CalendarClock, Flag, Megaphone, Shuffle, Sparkles, UserPlus, X } from "lucide-react";
import { parseActivityFeed, type ActivityType, type ActivityVisibility, type TournamentActivityFeed } from "@/lib/platform/activity";
import { formatPostedAt, splitFeed } from "@/lib/platform/tournamentHome";
import { Holding, PlaySection } from "./PlayShell";
import styles from "./Play.module.css";

const EVENT_ICONS: Partial<Record<ActivityType, typeof Flag>> = { tournament_published: Sparkles, players_updated: UserPlus, teams_updated: Shuffle, schedule_updated: CalendarClock };

/**
 * Commissioner announcements + tournament activity, exactly as the backend
 * returned them for this viewer. Post Announcement follows the backend's
 * viewer.canPostAnnouncement flag only; the server checks again on post.
 */
export function TournamentFeed({ slug, year, timezone, initialFeed }: { slug: string; year: number; timezone: string; initialFeed: TournamentActivityFeed }) {
  const [feed, setFeed] = useState(initialFeed);
  const [composing, setComposing] = useState(false);
  const { announcements, events } = splitFeed(feed);
  const canPost = feed.viewer.canPostAnnouncement;

  return <>
    <PlaySection title="Commissioner" id="play-announcements"
      action={canPost && !composing ? <button type="button" className={styles.textAction} onClick={() => setComposing(true)}><Megaphone size={16} aria-hidden="true" />Post Announcement</button> : undefined}>
      {canPost && composing && <AnnouncementForm slug={slug} year={year} onCancel={() => setComposing(false)} onPosted={(next) => { setFeed(next); setComposing(false); }} />}
      {announcements.length === 0 ? <Holding title="No announcements yet.">{canPost ? "Post one to let everyone know what's coming." : "Updates from the commissioner will show up here."}</Holding>
        : <ul className={styles.announcements}>{announcements.map((item) => <li key={item.ref} className={styles.announcement}>
          <div className={styles.announcementMeta}>
            <span>{[item.authorName, formatPostedAt(item.createdAt, timezone)].filter(Boolean).join(" · ")}</span>
            {item.visibility === "players_only" && <span className={styles.tag}>Players only</span>}
          </div>
          {item.title && <h3>{item.title}</h3>}
          {item.body && <p>{item.body}</p>}
        </li>)}</ul>}
    </PlaySection>

    <PlaySection title="Activity" id="play-activity">
      {events.length === 0 ? <Holding title="No activity yet." />
        : <ul className={styles.activity}>{events.map((item) => {
          const Icon = EVENT_ICONS[item.type] ?? Flag;
          return <li key={item.ref}>
            <span className={styles.activityIcon} aria-hidden="true"><Icon size={16} /></span>
            <span className={styles.activityText}>{item.summary ?? "Tournament updated."}</span>
            <time dateTime={item.createdAt}>{formatPostedAt(item.createdAt, timezone)}</time>
          </li>;
        })}</ul>}
    </PlaySection>
  </>;
}

function AnnouncementForm({ slug, year, onCancel, onPosted }: { slug: string; year: number; onCancel: () => void; onPosted: (feed: TournamentActivityFeed) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<ActivityVisibility>("everyone");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/platform/tournaments/${encodeURIComponent(slug)}/${year}/announcements`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body, visibility }),
      });
      const json: unknown = await response.json().catch(() => null);
      const result = (json ?? {}) as { ok?: boolean; error?: string };
      const next = result.ok ? parseActivityFeed(json) : null;
      if (!response.ok || !next) {
        setError(typeof result.error === "string" ? result.error : "Could not post the announcement. Try again.");
        return;
      }
      onPosted(next);
    } catch {
      setError("Could not post the announcement. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return <form className={styles.composer} onSubmit={submit} aria-label="Post Announcement">
    <div className={styles.composerHead}>
      <p>New announcement</p>
      <button type="button" className={styles.iconButton} onClick={onCancel} aria-label="Cancel"><X size={18} aria-hidden="true" /></button>
    </div>
    <label>Title <span>(optional)</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></label>
    <label>Message<textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={4} required /></label>
    <fieldset>
      <legend>Who can see it</legend>
      <label className={styles.choice}><input type="radio" name="visibility" checked={visibility === "everyone"} onChange={() => setVisibility("everyone")} />Everyone</label>
      <label className={styles.choice}><input type="radio" name="visibility" checked={visibility === "players_only"} onChange={() => setVisibility("players_only")} />Players only</label>
    </fieldset>
    {error && <p className={styles.formError} role="alert">{error}</p>}
    <button type="submit" className={styles.primaryButton} disabled={saving || !body.trim()}>{saving ? "Posting…" : "Post"}</button>
  </form>;
}
