"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Search, UserPlus, X } from "lucide-react";
import type { FriendRequest, GolferResult, Relation } from "@/lib/profile/friendRequestsServer";
import settings from "@/components/settings/Settings.module.css";
import styles from "./FindGolfers.module.css";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

function Avatar({ name, url }: { name: string; url: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element -- profile photos come from storage at any size; a plain img keeps it simple
  return url ? <img src={url} alt="" className={styles.avatar} /> : <span className={styles.avatar} aria-hidden="true">{initials(name)}</span>;
}

/**
 * Profile → Find Golfers: search golfers by name or @username and ask to be friends (Add friend → Requested; Accept when
 * they asked first; Friends once you are). Requests waiting on me show first, with Accept / Decline. An accepted request
 * makes us friends, like golfing on a trip together.
 */
export function FindGolfers({ incoming: firstIncoming, setupMessage }: { incoming: FriendRequest[]; setupMessage: string | null }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GolferResult[] | null>(null);
  const [incoming, setIncoming] = useState(firstIncoming);
  const [problem, setProblem] = useState<string | null>(setupMessage);
  const [busy, setBusy] = useState<string | null>(null);
  const words = query.trim();
  // Under two letters there's nothing to show (an older search's results stay hidden).
  const shown = words.length < 2 ? null : results;

  useEffect(() => {
    if (words.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/profile/search?q=${encodeURIComponent(words)}`, { cache: "no-store", signal: controller.signal })
        .then((r) => r.json() as Promise<{ ok: boolean; golfers?: GolferResult[]; message?: string }>)
        .then((body) => { if (body.ok) { setResults(body.golfers ?? []); setProblem(null); } else setProblem(body.message ?? "Couldn't search right now. Try again."); })
        .catch((e: Error) => { if (e.name !== "AbortError") setProblem("No connection. Try again when you're back online."); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [words]);

  async function send(body: object): Promise<Relation | null> {
    const reply = await fetch("/api/profile/friends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json() as Promise<{ ok: boolean; relation?: Relation; message?: string }>).catch(() => null);
    if (!reply?.ok) { setProblem(reply?.message ?? "No connection. Try again when you're back online."); return null; }
    setProblem(null);
    return reply.relation ?? "friends";
  }
  async function addFriend(golfer: GolferResult) {
    setBusy(golfer.id);
    const relation = await send({ to: golfer.id });
    if (relation) {
      setResults((list) => list && list.map((g) => g.id === golfer.id ? { ...g, relation } : g));
      if (relation === "friends") setIncoming((list) => list.filter((r) => r.profileId !== golfer.id));
    }
    setBusy(null);
  }
  async function answer(request: FriendRequest, accept: boolean) {
    setBusy(request.id);
    if (await send({ request: request.id, accept })) {
      setIncoming((list) => list.filter((r) => r.id !== request.id));
      setResults((list) => list && list.map((g) => g.id === request.profileId ? { ...g, relation: accept ? "friends" : "none" } : g));
    }
    setBusy(null);
  }

  const action = (g: GolferResult) => g.relation === "friends" ? <span className={`${styles.badge} ${styles.badgeFriends}`}><Check size={14} aria-hidden="true" /> Friends</span>
    : g.relation === "requested" ? <span className={styles.badge}>Requested</span>
    : <button type="button" className={styles.add} disabled={busy === g.id} onClick={() => void addFriend(g)}>
      {g.relation === "incoming" ? <><Check size={15} aria-hidden="true" /> Accept</> : <><UserPlus size={15} aria-hidden="true" /> Add friend</>}</button>;

  return <main className={settings.page}>
    <div className={settings.inner}>
      <header className={settings.header}>
        <Link href="/profile" className={settings.back} aria-label="Back to Profile"><ArrowLeft size={18} aria-hidden="true" /></Link>
        <span className={settings.backLabel}>Profile</span><h1 className="sr-only">Find Golfers</h1>
      </header>

      <section className={settings.card} aria-labelledby="find-golfers">
        <h2 id="find-golfers" className={settings.cardTitle}>Find Golfers</h2>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search golfers by name or username</span>
          <input type="search" placeholder="Name or @username" value={query} maxLength={60} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
        </label>
        {problem && <p className={styles.problem} role="alert">{problem}</p>}
        {shown === null ? <p className={styles.note}>Type at least two letters to look someone up.</p>
          : !shown.length ? <p className={styles.note}>No golfers match &ldquo;{words}&rdquo;.</p>
          : <ul className={styles.list}>{shown.map((g) => <li key={g.id}>
            <Link href={g.username ? `/profile/${g.username}` : "#"} className={styles.who}>
              <Avatar name={g.name} url={g.photoUrl} />
              <span><b>{g.name}</b>{g.username && <small>@{g.username}</small>}</span>
            </Link>
            {action(g)}
          </li>)}</ul>}
      </section>

      {incoming.length > 0 && <section className={settings.card} aria-labelledby="friend-requests">
        <h2 id="friend-requests" className={settings.cardTitle}>Friend requests <span className={styles.count}>{incoming.length}</span></h2>
        <ul className={styles.list}>{incoming.map((r) => <li key={r.id}>
          <Link href={r.username ? `/profile/${r.username}` : "#"} className={styles.who}>
            <Avatar name={r.name} url={r.photoUrl} />
            <span><b>{r.name}</b>{r.username && <small>@{r.username}</small>}</span>
          </Link>
          <span className={styles.answer}>
            <button type="button" className={styles.add} disabled={busy === r.id} onClick={() => void answer(r, true)}><Check size={15} aria-hidden="true" /> Accept</button>
            <button type="button" className={styles.decline} aria-label={`Decline ${r.name}`} disabled={busy === r.id} onClick={() => void answer(r, false)}><X size={16} aria-hidden="true" /></button>
          </span>
        </li>)}</ul>
      </section>}
    </div>
  </main>;
}
