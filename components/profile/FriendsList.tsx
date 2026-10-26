"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Search, UserPlus } from "lucide-react";
import type { FriendListItem } from "@/lib/profile/friendRequestsServer";
import settings from "@/components/settings/Settings.module.css";
import styles from "./FindGolfers.module.css";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/**
 * Profile → Friends: everyone I'm friends with (golf trip mates and accepted requests), with a small search at the top.
 * Tapping a friend opens their profile, where the friend button switches the friendship off (and on again).
 */
export function FriendsList({ friends }: { friends: FriendListItem[] }) {
  const [query, setQuery] = useState("");
  const words = query.trim().toLowerCase();
  const shown = words ? friends.filter((f) => f.name.toLowerCase().includes(words) || (f.username ?? "").toLowerCase().includes(words.replace(/^@/, ""))) : friends;
  return <main className={settings.page}>
    <div className={settings.inner}>
      <header className={settings.header}>
        <Link href="/profile" className={settings.back} aria-label="Back to Profile"><ArrowLeft size={18} aria-hidden="true" /></Link>
        <span className={settings.backLabel}>Profile</span><h1 className="sr-only">Friends</h1>
      </header>
      <section className={settings.card} aria-labelledby="friends-title">
        <h2 id="friends-title" className={settings.cardTitle}>Friends <span className={styles.total}>{friends.length}</span></h2>
        {friends.length > 0 && <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search your friends</span>
          <input type="search" placeholder="Search friends" value={query} maxLength={60} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
        </label>}
        {!friends.length ? <p className={styles.note}>No friends yet. Golf on a trip together, or find golfers and send a request.</p>
          : !shown.length ? <p className={styles.note}>No friends match &ldquo;{query.trim()}&rdquo;.</p>
          : <ul className={styles.list}>{shown.map((f) => <li key={f.id}>
            <Link href={f.username ? `/profile/${f.username}` : "#"} className={`${styles.who} ${styles.whoRow}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- profile photos come from storage at any size */}
              {f.photoUrl ? <img src={f.photoUrl} alt="" className={styles.avatar} /> : <span className={styles.avatar} aria-hidden="true">{initials(f.name)}</span>}
              <span><b>{f.name}</b><small>{f.username ? `@${f.username}` : ""}{f.tripMate ? `${f.username ? " · " : ""}Golf trip` : ""}</small></span>
              <ChevronRight size={18} aria-hidden="true" className={styles.chevron} />
            </Link>
          </li>)}</ul>}
        <Link href="/profile/search" className={styles.findMore}><UserPlus size={16} aria-hidden="true" /> Find golfers</Link>
      </section>
    </div>
  </main>;
}
