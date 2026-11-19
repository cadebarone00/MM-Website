"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Lock, Search, UserPlus, X } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import type { FriendRequest, GolferResult, Relation } from "@/lib/profile/friendRequestsServer";
import styles from "./ProfileSearch.module.css";

/** Where the Search page gets its golfers and sends friend actions: the live account, or the dev sample (DevProfilePreview). */
export interface ProfileSearchSource {
  search(query: string, signal: AbortSignal): Promise<GolferResult[]>;
  suggest(): Promise<GolferResult[]>;
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

/** The live account. */
export const ACCOUNT_SEARCH: ProfileSearchSource = {
  async search(query, signal) { return (await ask<{ golfers?: GolferResult[] }>(`/api/profile/search?q=${encodeURIComponent(query)}`, { signal })).golfers ?? []; },
  async suggest() { return (await ask<{ golfers?: GolferResult[] }>("/api/profile/search?suggest=1")).golfers ?? []; },
  async incoming() { return (await ask<{ incoming?: FriendRequest[] }>("/api/profile/friends?requests=1")).incoming ?? []; },
  async befriend(golfer) { return (await ask<{ relation?: Relation }>("/api/profile/friends", post({ to: golfer.id }))).relation ?? "requested"; },
  async answer(request, accept) { await ask("/api/profile/friends", post({ request: request.id, accept })); },
  href: (username) => `/profile/${encodeURIComponent(username)}`,
};

/** Recent: golfers you opened from search, newest first, on this device only (per-viewer convenience). */
type Recent = Pick<GolferResult, "id" | "name" | "username" | "photoUrl" | "isPrivate">;
const RECENT_MAX = 8;
function readRecents(key: string): Recent[] {
  try { const list = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown; return Array.isArray(list) ? (list as Recent[]).filter((r) => r && typeof r.id === "string" && typeof r.name === "string").slice(0, RECENT_MAX) : []; }
  catch { return []; }
}
function writeRecents(key: string, list: Recent[]) { try { localStorage.setItem(key, JSON.stringify(list.slice(0, RECENT_MAX))); } catch { /* storage blocked: recents just don't stick */ } }

/**
 * Search page (owner request 2026-11-19, Instagram-style). Before typing: friend requests, Recent, Suggested for you.
 * After 2+ letters: results (Public and Private, Private ones with a lock). Tap a golfer → their profile.
 */
export function ProfileSearch({ source = ACCOUNT_SEARCH, backHref = "/profile", initialQuery = "", recentKey = "maroon-search-recent-v1" }:
  { source?: ProfileSearchSource; backHref?: string; initialQuery?: string; recentKey?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GolferResult[] | null>(null);
  const [suggested, setSuggested] = useState<GolferResult[] | null>(null);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const words = query.trim();
  const typing = words.length >= 2;

  useEffect(() => {
    let live = true;
    // Read after mount (the server render has no browser storage).
    queueMicrotask(() => { if (live) setRecents(readRecents(recentKey)); });
    source.incoming().then((list) => { if (live) setIncoming(list); }).catch(() => {});
    source.suggest().then((list) => { if (live) setSuggested(list); }).catch(() => { if (live) setSuggested([]); });
    return () => { live = false; };
  }, [source, recentKey]);

  useEffect(() => {
    if (!typing) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      source.search(words, controller.signal)
        .then((list) => { setResults(list); setProblem(null); })
        .catch((e: Error) => { if (e.name !== "AbortError") setProblem(e.message); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [words, typing, source]);

  function remember(golfer: Recent) {
    const next = [golfer, ...recents.filter((r) => r.id !== golfer.id)];
    setRecents(next); writeRecents(recentKey, next);
  }
  function forget(id: string | null) {
    const next = id ? recents.filter((r) => r.id !== id) : [];
    setRecents(next); writeRecents(recentKey, next);
  }
  const setRelation = (id: string, relation: Relation) => {
    setResults((list) => list && list.map((g) => g.id === id ? { ...g, relation } : g));
    setSuggested((list) => list && list.map((g) => g.id === id ? { ...g, relation } : g));
  };
  async function befriend(golfer: GolferResult) {
    setBusy(golfer.id); setProblem(null);
    try {
      const relation = await source.befriend(golfer);
      setRelation(golfer.id, relation);
      if (relation === "friends") setIncoming((list) => list.filter((r) => r.profileId !== golfer.id));
    } catch (e) { setProblem(e instanceof Error ? e.message : "Couldn't send that. Try again."); }
    setBusy(null);
  }
  async function answer(request: FriendRequest, accept: boolean) {
    setBusy(request.id); setProblem(null);
    try {
      await source.answer(request, accept);
      setIncoming((list) => list.filter((r) => r.id !== request.id));
      setRelation(request.profileId, accept ? "friends" : "none");
    } catch (e) { setProblem(e instanceof Error ? e.message : "Couldn't answer that. Try again."); }
    setBusy(null);
  }

  const friendButton = (g: GolferResult) => g.relation === "friends" ? <span className={`${styles.badge} ${styles.badgeFriends}`}><Check size={14} aria-hidden="true" /> Friends</span>
    : g.relation === "requested" ? <span className={styles.badge}>Requested</span>
    : <button type="button" className={styles.add} disabled={busy === g.id} onClick={() => void befriend(g)}>
      {g.relation === "incoming" ? <><Check size={15} aria-hidden="true" /> Accept</> : <><UserPlus size={15} aria-hidden="true" /> Add</>}</button>;
  /** One Instagram-style row: avatar, @username (bold), then the name / a note in grey. */
  const who = (g: Recent, note?: string) =>
    <Link href={g.username ? source.href(g.username) : "#"} className={styles.who} onClick={() => remember({ id: g.id, name: g.name, username: g.username, photoUrl: g.photoUrl, isPrivate: g.isPrivate })}>
      <ProfileAvatar name={g.name} photoUrl={g.photoUrl} size={48} />
      <span className={styles.names}>
        <b>{g.username ?? g.name}{g.isPrivate && <Lock size={12} aria-label="Private profile" className={styles.lock} />}</b>
        <small>{note ? `${g.name} · ${note}` : g.name}</small>
      </span>
    </Link>;

  return <main className={styles.page}>
    <div className={styles.inner}>
      <div className={styles.bar}>
        <button type="button" className={styles.back} aria-label="Back" onClick={() => router.push(backHref)}><ChevronLeft size={28} aria-hidden="true" /></button>
        <label className={styles.field}>
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search golfers by name or username</span>
          <input type="search" placeholder="Search" value={query} maxLength={60} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            onChange={(e) => setQuery(e.target.value)} />
        </label>
        {query && <button type="button" className={styles.cancel} onClick={() => setQuery("")}>Cancel</button>}
      </div>
      {problem && <p className={styles.problem} role="alert">{problem}</p>}

      {typing ? (results === null ? <p className={styles.note}>Searching…</p>
        : !results.length ? <p className={styles.note}>No results for &ldquo;{words}&rdquo;.</p>
        : <ul className={styles.list} aria-label="Results">{results.map((g) => <li key={g.id}>{who(g)}{friendButton(g)}</li>)}</ul>)
      : <>
        {incoming.length > 0 && <section aria-labelledby="search-requests">
          <h2 id="search-requests" className={styles.heading}>Friend requests <span className={styles.count}>{incoming.length}</span></h2>
          <ul className={styles.list}>{incoming.map((r) => <li key={r.id}>
            {who({ id: r.profileId, name: r.name, username: r.username, photoUrl: r.photoUrl, isPrivate: false })}
            <span className={styles.answer}>
              <button type="button" className={styles.add} disabled={busy === r.id} onClick={() => void answer(r, true)}><Check size={15} aria-hidden="true" /> Accept</button>
              <button type="button" className={styles.decline} aria-label={`Decline ${r.name}`} disabled={busy === r.id} onClick={() => void answer(r, false)}><X size={16} aria-hidden="true" /></button>
            </span>
          </li>)}</ul>
        </section>}

        {recents.length > 0 && <section aria-labelledby="search-recent">
          <div className={styles.headingRow}><h2 id="search-recent" className={styles.heading}>Recent</h2><button type="button" className={styles.clear} onClick={() => forget(null)}>Clear all</button></div>
          <ul className={styles.list}>{recents.map((r) => <li key={r.id}>
            {who(r)}
            <button type="button" className={styles.remove} aria-label={`Remove ${r.name} from recent`} onClick={() => forget(r.id)}><X size={18} aria-hidden="true" /></button>
          </li>)}</ul>
        </section>}

        <section aria-labelledby="search-suggested">
          <h2 id="search-suggested" className={styles.heading}>Suggested for you</h2>
          {suggested === null ? <p className={styles.note}>Finding golfers…</p>
            : !suggested.length ? <p className={styles.note}>No suggestions yet. Search for a golfer by name or @username.</p>
            : <ul className={styles.list}>{suggested.map((g) => <li key={g.id}>
              {who(g, g.mutuals ? `${g.mutuals} mutual friend${g.mutuals === 1 ? "" : "s"}` : "Suggested for you")}{friendButton(g)}
            </li>)}</ul>}
        </section>
      </>}
    </div>
  </main>;
}
