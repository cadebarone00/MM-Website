"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Lock, Search, UserPlus, X } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import type { FriendListItem, FriendRequest, GolferResult, Relation } from "@/lib/profile/friendRequestsServer";
import type { FriendsData } from "@/lib/profile/profileScreensData";
import styles from "./ProfileSearch.module.css";

/** Where the Search page gets its golfers and sends friend actions: the live account, or the dev sample (DevProfilePreview). */
export interface ProfileSearchSource {
  search(query: string, signal: AbortSignal): Promise<GolferResult[]>;
  suggest(): Promise<GolferResult[]>;
  incoming(): Promise<FriendRequest[]>;
  /** My friends (the Friends tab). */
  friends(): Promise<FriendListItem[]>;
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
  async friends() { const data = (await ask<{ data?: FriendsData }>("/api/app/profile?view=friends")).data; return data?.status === "ok" ? data.friends : []; },
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

/** The tabs under the search bar (owner request 2026-11-20). In the address as ?tab=friends / ?tab=suggested. */
export type SearchTab = "search" | "friends" | "suggested";
const TABS: { id: SearchTab; label: string }[] = [{ id: "search", label: "Search" }, { id: "friends", label: "Friends" }, { id: "suggested", label: "Suggested" }];
export const searchTabFrom = (value: string | null | undefined): SearchTab | null => value === "search" || value === "friends" || value === "suggested" ? value : null;

/**
 * Search page (owner request 2026-11-19, Instagram-style; tabs 2026-11-20). Under the bar: Search · Friends · Suggested.
 * Search: friend requests and Recent, then results after 2+ letters (Public and Private, Private ones with a lock).
 * Friends: my friends; typing narrows them. Suggested: Suggested for you; typing goes to Search. Tap a golfer → their profile.
 * `initialTab`: the tab to open on (else ?tab= in the address, else Search).
 */
export function ProfileSearch({ source = ACCOUNT_SEARCH, backHref = "/profile", initialQuery = "", recentKey = "maroon-search-recent-v1", initialTab }:
  { source?: ProfileSearchSource; backHref?: string; initialQuery?: string; recentKey?: string; initialTab?: SearchTab }) {
  const router = useRouter();
  const [tab, setTab] = useState<SearchTab>(initialTab ?? "search");
  const [friends, setFriends] = useState<FriendListItem[] | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GolferResult[] | null>(null);
  const [suggested, setSuggested] = useState<GolferResult[] | null>(null);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const words = query.trim();
  const typing = tab === "search" && words.length >= 2;

  // The app's packaged page can't read the address on the server: pick up ?tab= after it opens.
  useEffect(() => {
    if (initialTab) return;
    const fromAddress = searchTabFrom(new URLSearchParams(window.location.search).get("tab"));
    if (fromAddress) queueMicrotask(() => setTab(fromAddress));
  }, [initialTab]);

  function pickTab(next: SearchTab) {
    setTab(next);
    // Keep the tab in the address (Back and shared links land on it) without reloading the page.
    try {
      const url = new URL(window.location.href);
      if (next === "search") url.searchParams.delete("tab"); else url.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", url);
    } catch { /* the address just doesn't follow */ }
  }
  function type(value: string) {
    setQuery(value);
    // Suggested has nothing to narrow: typing there searches everyone.
    if (tab === "suggested" && value.trim()) pickTab("search");
  }

  useEffect(() => {
    let live = true;
    // Read after mount (the server render has no browser storage).
    queueMicrotask(() => { if (live) setRecents(readRecents(recentKey)); });
    source.incoming().then((list) => { if (live) setIncoming(list); }).catch(() => {});
    source.suggest().then((list) => { if (live) setSuggested(list); }).catch(() => { if (live) setSuggested([]); });
    source.friends().then((list) => { if (live) setFriends(list); }).catch(() => { if (live) setFriends([]); });
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
  /** A new friend shows on the Friends tab straight away (A–Z). */
  function addFriend(f: Pick<FriendListItem, "id" | "name" | "username" | "photoUrl">) {
    setFriends((list) => list && !list.some((x) => x.id === f.id) ? [...list, { ...f, tripMate: false }].sort((a, b) => a.name.localeCompare(b.name)) : list);
  }
  async function befriend(golfer: GolferResult) {
    setBusy(golfer.id); setProblem(null);
    try {
      const relation = await source.befriend(golfer);
      setRelation(golfer.id, relation);
      if (relation === "friends") { setIncoming((list) => list.filter((r) => r.profileId !== golfer.id)); addFriend(golfer); }
    } catch (e) { setProblem(e instanceof Error ? e.message : "Couldn't send that. Try again."); }
    setBusy(null);
  }
  async function answer(request: FriendRequest, accept: boolean) {
    setBusy(request.id); setProblem(null);
    try {
      await source.answer(request, accept);
      setIncoming((list) => list.filter((r) => r.id !== request.id));
      setRelation(request.profileId, accept ? "friends" : "none");
      if (accept) addFriend({ id: request.profileId, name: request.name, username: request.username, photoUrl: request.photoUrl });
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

  const needle = words.toLowerCase().replace(/^@/, "");
  const shownFriends = friends && (needle ? friends.filter((f) => f.name.toLowerCase().includes(needle) || (f.username ?? "").toLowerCase().includes(needle)) : friends);

  return <main className={styles.page}>
    <div className={styles.inner}>
      <div className={styles.top}>
        <div className={styles.bar}>
          <button type="button" className={styles.back} aria-label="Back" onClick={() => router.push(backHref)}><ChevronLeft size={28} aria-hidden="true" /></button>
          <label className={styles.field}>
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">{tab === "friends" ? "Search your friends" : "Search golfers by name or username"}</span>
            <input type="search" placeholder={tab === "friends" ? "Search friends" : "Search"} value={query} maxLength={60} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onChange={(e) => type(e.target.value)} />
          </label>
          {query && <button type="button" className={styles.cancel} onClick={() => setQuery("")}>Cancel</button>}
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Search, Friends or Suggested">
          {TABS.map((t) => <button key={t.id} type="button" role="tab" id={`search-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="search-panel"
            className={`${styles.tab} ${tab === t.id ? styles.tabOn : ""}`} onClick={() => pickTab(t.id)}>{t.label}</button>)}
        </div>
      </div>
      {problem && <p className={styles.problem} role="alert">{problem}</p>}

      <div id="search-panel" role="tabpanel" aria-labelledby={`search-tab-${tab}`}>
        {tab === "friends" ? (friends === null ? <p className={styles.note}>Loading your friends…</p>
          : !friends.length ? <p className={styles.note}>No friends yet. Golf on a trip together, or add golfers from <button type="button" className={styles.inlineLink} onClick={() => pickTab("suggested")}>Suggested</button>.</p>
          : !shownFriends?.length ? <p className={styles.note}>No friends match &ldquo;{words}&rdquo;.</p>
          : <>
            <h2 className={styles.heading}>{needle ? "Friends" : `${friends.length} friend${friends.length === 1 ? "" : "s"}`}</h2>
            <ul className={styles.list} aria-label="Your friends">{shownFriends.map((f) => <li key={f.id}>{who({ ...f, isPrivate: false }, f.tripMate ? "Golf trip" : undefined)}</li>)}</ul>
          </>)

        : tab === "suggested" ? <section aria-labelledby="search-suggested">
          <h2 id="search-suggested" className={styles.heading}>Suggested for you</h2>
          {suggested === null ? <p className={styles.note}>Finding golfers…</p>
            : !suggested.length ? <p className={styles.note}>No suggestions yet. Search for a golfer by name or @username.</p>
            : <ul className={styles.list}>{suggested.map((g) => <li key={g.id}>
              {who(g, g.mutuals ? `${g.mutuals} mutual friend${g.mutuals === 1 ? "" : "s"}` : "Suggested for you")}{friendButton(g)}
            </li>)}</ul>}
        </section>

        : typing ? (results === null ? <p className={styles.note}>Searching…</p>
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

          {!incoming.length && !recents.length && <p className={styles.note}>Search for a golfer by name or @username.</p>}
        </>}
      </div>
    </div>
  </main>;
}
