"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Lock, Search, UserPlus, X } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import type { FriendRequest, GolferResult, Relation } from "@/lib/profile/friendRequestsServer";
import styles from "./ProfileSearch.module.css";

/** Where the search bar gets its golfers and sends friend actions: the live account, or the dev sample (DevProfilePreview). */
export interface ProfileSearchSource {
  search(query: string, signal: AbortSignal): Promise<GolferResult[]>;
  incoming(): Promise<FriendRequest[]>;
  befriend(golfer: GolferResult): Promise<Relation>;
  answer(request: FriendRequest, accept: boolean): Promise<void>;
  /** Their profile's address. */
  href(username: string): string;
}

async function ask<T>(url: string, init?: RequestInit): Promise<T> {
  const reply = await fetch(url, { cache: "no-store", ...init }).then((r) => r.json()).catch(() => null) as (T & { ok?: boolean; message?: string }) | null;
  if (!reply?.ok) throw new Error(reply?.message ?? "No connection. Try again when you're back online.");
  return reply;
}
const post = (body: object): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** The live account (the same routes the old Find Golfers page used). */
export const ACCOUNT_SEARCH: ProfileSearchSource = {
  async search(query, signal) { return (await ask<{ golfers?: GolferResult[] }>(`/api/profile/search?q=${encodeURIComponent(query)}`, { signal })).golfers ?? []; },
  async incoming() { return (await ask<{ incoming?: FriendRequest[] }>("/api/profile/friends?requests=1")).incoming ?? []; },
  async befriend(golfer) { return (await ask<{ relation?: Relation }>("/api/profile/friends", post({ to: golfer.id }))).relation ?? "requested"; },
  async answer(request, accept) { await ask("/api/profile/friends", post({ request: request.id, accept })); },
  href: (username) => `/profile/${encodeURIComponent(username)}`,
};

/**
 * Profile → search icon (owner request 2026-11-13): a search bar that slides down at the very top of the screen. Type a
 * name or @username (2+ letters) and the results drop down under it — Public and Private profiles both, Private ones
 * tagged — with the friend button. Nothing typed yet = friend requests waiting on you. Cancel closes it.
 */
export function ProfileSearch({ source = ACCOUNT_SEARCH, initialQuery = "", onClose }: { source?: ProfileSearchSource; initialQuery?: string; onClose: () => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GolferResult[] | null>(null);
  const [incoming, setIncoming] = useState<FriendRequest[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const words = query.trim();
  const shown = words.length < 2 ? null : results;

  useEffect(() => {
    let live = true;
    source.incoming().then((list) => { if (live) setIncoming(list); }).catch(() => { if (live) setIncoming([]); });
    return () => { live = false; };
  }, [source]);

  useEffect(() => {
    if (words.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      source.search(words, controller.signal)
        .then((list) => { setResults(list); setProblem(null); })
        .catch((e: Error) => { if (e.name !== "AbortError") setProblem(e.message); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [words, source]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function befriend(golfer: GolferResult) {
    setBusy(golfer.id); setProblem(null);
    try {
      const relation = await source.befriend(golfer);
      setResults((list) => list && list.map((g) => g.id === golfer.id ? { ...g, relation } : g));
      if (relation === "friends") setIncoming((list) => list && list.filter((r) => r.profileId !== golfer.id));
    } catch (e) { setProblem(e instanceof Error ? e.message : "Couldn't send that. Try again."); }
    setBusy(null);
  }
  async function answer(request: FriendRequest, accept: boolean) {
    setBusy(request.id); setProblem(null);
    try {
      await source.answer(request, accept);
      setIncoming((list) => list && list.filter((r) => r.id !== request.id));
      setResults((list) => list && list.map((g) => g.id === request.profileId ? { ...g, relation: accept ? "friends" : "none" } : g));
    } catch (e) { setProblem(e instanceof Error ? e.message : "Couldn't answer that. Try again."); }
    setBusy(null);
  }

  const action = (g: GolferResult) => g.relation === "friends" ? <span className={`${styles.badge} ${styles.badgeFriends}`}><Check size={14} aria-hidden="true" /> Friends</span>
    : g.relation === "requested" ? <span className={styles.badge}>Requested</span>
    : <button type="button" className={styles.add} disabled={busy === g.id} onClick={() => void befriend(g)}>
      {g.relation === "incoming" ? <><Check size={15} aria-hidden="true" /> Accept</> : <><UserPlus size={15} aria-hidden="true" /> Add</>}</button>;
  const who = (name: string, username: string | null, photoUrl: string | null, isPrivate = false) =>
    <Link href={username ? source.href(username) : "#"} className={styles.who} onClick={onClose}>
      <ProfileAvatar name={name} photoUrl={photoUrl} size={44} />
      <span className={styles.names}>
        <b>{name}</b>
        <small>{username && `@${username}`}{isPrivate && <span className={styles.private}><Lock size={11} aria-hidden="true" /> Private</span>}</small>
      </span>
    </Link>;

  return <div className={styles.overlay} role="dialog" aria-label="Search golfers">
    <div className={styles.bar}>
      <label className={styles.field}>
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">Search golfers by name or username</span>
        <input type="search" autoFocus placeholder="Search name or @username" value={query} maxLength={60} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onChange={(e) => setQuery(e.target.value)} />
      </label>
      <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
    </div>

    <div className={styles.body}>
      {problem && <p className={styles.problem} role="alert">{problem}</p>}
      {shown === null ? <>
        {incoming && incoming.length > 0 && <>
          <h2 className={styles.heading}>Friend requests <span className={styles.count}>{incoming.length}</span></h2>
          <ul className={styles.list}>{incoming.map((r) => <li key={r.id}>
            {who(r.name, r.username, r.photoUrl)}
            <span className={styles.answer}>
              <button type="button" className={styles.add} disabled={busy === r.id} onClick={() => void answer(r, true)}><Check size={15} aria-hidden="true" /> Accept</button>
              <button type="button" className={styles.decline} aria-label={`Decline ${r.name}`} disabled={busy === r.id} onClick={() => void answer(r, false)}><X size={16} aria-hidden="true" /></button>
            </span>
          </li>)}</ul>
        </>}
        <p className={styles.note}>Type at least two letters to find a golfer by name or @username.</p>
      </> : !shown.length ? <p className={styles.note}>No golfers match &ldquo;{words}&rdquo;.</p>
        : <ul className={styles.list}>{shown.map((g) => <li key={g.id}>{who(g.name, g.username, g.photoUrl, g.isPrivate)}{action(g)}</li>)}</ul>}
    </div>
  </div>;
}
