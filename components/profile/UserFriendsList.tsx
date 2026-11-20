"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Lock, Search, UserPlus } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import type { FriendOfItem, Relation } from "@/lib/profile/friendRequestsServer";
import styles from "./ProfileSearch.module.css";

/** The live account: ask a golfer to be friends (the same route the Search page uses). */
async function accountBefriend(id: string): Promise<Relation> {
  const reply = await fetch("/api/profile/friends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: id }) })
    .then((r) => r.json()).catch(() => null) as { ok?: boolean; relation?: Relation; message?: string } | null;
  if (!reply?.ok) throw new Error(reply?.message ?? "No connection. Try again when you're back online.");
  return reply.relation ?? "requested";
}

/**
 * Someone's Friends list (owner request 2026-11-20): opened from the Friends count on their Public profile. Back and
 * their @username at the top, a search bar that narrows the list, then their friends (tap → that golfer's profile; Add
 * on golfers you're not friends with yet). `friends` null = their profile is Private, so no list.
 * `profileHref`: a golfer's profile address, with "{username}" where the username goes.
 */
export function UserFriendsList({ username, friends: initial, signedIn, backHref, profileHref = "/profile/{username}", befriend = accountBefriend }: {
  username: string; friends: FriendOfItem[] | null; signedIn: boolean; backHref: string; profileHref?: string; befriend?: (id: string) => Promise<Relation>;
}) {
  const router = useRouter();
  const [friends, setFriends] = useState(initial);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const needle = query.trim().toLowerCase().replace(/^@/, "");
  const shown = friends && (needle ? friends.filter((f) => f.name.toLowerCase().includes(needle) || (f.username ?? "").toLowerCase().includes(needle)) : friends);
  const hrefFor = (name: string) => profileHref.replace("{username}", encodeURIComponent(name));

  async function add(friend: FriendOfItem) {
    setBusy(friend.id); setProblem(null);
    try {
      const relation = await befriend(friend.id);
      setFriends((list) => list && list.map((f) => f.id === friend.id ? { ...f, relation } : f));
    } catch (e) { setProblem(e instanceof Error ? e.message : "Couldn't send that. Try again."); }
    setBusy(null);
  }

  const button = (f: FriendOfItem) => f.you ? <span className={styles.badge}>You</span>
    : !signedIn ? null
    : f.relation === "friends" ? <span className={`${styles.badge} ${styles.badgeFriends}`}><Check size={14} aria-hidden="true" /> Friends</span>
    : f.relation === "requested" ? <span className={styles.badge}>Requested</span>
    : <button type="button" className={styles.add} disabled={busy === f.id} onClick={() => void add(f)}>
      {f.relation === "incoming" ? <><Check size={15} aria-hidden="true" /> Accept</> : <><UserPlus size={15} aria-hidden="true" /> Add</>}</button>;

  return <main className={styles.page}>
    <div className={styles.inner}>
      <div className={styles.top}>
        <div className={styles.titleBar}>
          <button type="button" className={styles.back} aria-label="Back" onClick={() => router.push(backHref)}><ChevronLeft size={28} aria-hidden="true" /></button>
          <h1 className={styles.title}>{username}</h1>
          <span className={styles.titleSpacer} aria-hidden="true" />
        </div>
        {friends && <div className={styles.bar}>
          <label className={styles.field}>
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Search {username}&apos;s friends</span>
            <input type="search" placeholder="Search friends" value={query} maxLength={60} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onChange={(e) => setQuery(e.target.value)} />
          </label>
          {query && <button type="button" className={styles.cancel} onClick={() => setQuery("")}>Cancel</button>}
        </div>}
      </div>
      {problem && <p className={styles.problem} role="alert">{problem}</p>}

      {!friends ? <div className={styles.privateNote}><Lock size={28} aria-hidden="true" /><b>Private Profile</b><span>Their friends list is hidden.</span></div>
        : !friends.length ? <p className={styles.note}>No friends yet.</p>
        : !shown?.length ? <p className={styles.note}>No friends match &ldquo;{query.trim()}&rdquo;.</p>
        : <>
          <h2 className={styles.heading}>{needle ? "Friends" : `${friends.length} friend${friends.length === 1 ? "" : "s"}`}</h2>
          <ul className={styles.list} aria-label={`${username}'s friends`}>{shown.map((f) => <li key={f.id}>
            <Link href={f.username ? hrefFor(f.username) : "#"} className={styles.who}>
              <ProfileAvatar name={f.name} photoUrl={f.photoUrl} size={48} />
              <span className={styles.names}>
                <b>{f.username ?? f.name}{f.isPrivate && <Lock size={12} aria-label="Private profile" className={styles.lock} />}</b>
                <small>{f.name}</small>
              </span>
            </Link>
            {button(f)}
          </li>)}</ul>
        </>}
    </div>
  </main>;
}
