"use client";

import { useState } from "react";
import { Clock, UserCheck, UserPlus } from "lucide-react";
import type { Relation } from "@/lib/profile/friendRequestsServer";
import styles from "./FriendToggle.module.css";

/**
 * The friend button on another golfer's profile, a toggle: ✓ Friends → tap to stop being friends (→ Add friend);
 * Add friend → tap to ask (→ Requested, or Friends if they'd already asked); Requested → tap to take it back;
 * Accept → they asked me. Golf trip mates are friends from the trip, so theirs doesn't switch off.
 */
export function FriendToggle({ profileId, name, initial, tripMate }: { profileId: string; name: string; initial: Relation; tripMate: boolean }) {
  const [relation, setRelation] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function toggle() {
    if (busy || (relation === "friends" && tripMate)) return;
    const off = relation === "friends" || relation === "requested";
    setBusy(true); setProblem(null);
    const reply = await fetch("/api/profile/friends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(off ? { remove: profileId } : { to: profileId }) })
      .then((r) => r.json() as Promise<{ ok: boolean; relation?: Relation; message?: string }>).catch(() => null);
    setBusy(false);
    if (reply?.ok) setRelation(reply.relation ?? (off ? "none" : "requested"));
    else setProblem(reply?.message ?? "No connection. Try again.");
  }
  const on = relation === "friends";
  const label = on ? (tripMate ? "Friends · Trip" : "Friends") : relation === "requested" ? "Requested" : relation === "incoming" ? "Accept" : "Add friend";
  const Icon = on ? UserCheck : relation === "requested" ? Clock : UserPlus;
  return <div className={styles.wrap}>
    <button type="button" className={`${styles.toggle} ${on ? styles.on : ""}`} aria-pressed={on} disabled={busy}
      aria-label={on ? (tripMate ? `Friends with ${name} from a golf trip` : `Friends with ${name}. Tap to stop being friends`) : relation === "requested" ? `Friend request sent to ${name}. Tap to take it back` : relation === "incoming" ? `Accept ${name}'s friend request` : `Add ${name} as a friend`}
      title={on && tripMate ? "Friends from a golf trip together" : undefined} onClick={() => void toggle()}>
      <Icon size={18} aria-hidden="true" /><span>{busy ? "…" : label}</span>
    </button>
    {problem && <p className={styles.problem} role="alert">{problem}</p>}
  </div>;
}
