"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "@/components/profile/FriendRequestBadge.module.css";

/**
 * A red count of rounds I've been invited to and haven't answered (Play tab). The invite cards on Play open the round.
 * Checks when the page changes and every minute while the app is open; nothing at 0 or when signed out.
 */
export function RoundInviteBadge({ className }: { className?: string }) {
  const [count, setCount] = useState(0);
  const pathname = usePathname();
  useEffect(() => {
    let live = true;
    const check = () => fetch("/api/rounds/invites", { cache: "no-store" }).then((r) => r.json() as Promise<{ invites?: unknown[] }>)
      .then((body) => { if (live) setCount(body.invites?.length ?? 0); }).catch(() => {});
    void check();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void check(); }, 60000);
    return () => { live = false; window.clearInterval(timer); };
  }, [pathname]);
  if (!count) return null;
  return <span className={`${styles.badge} ${className ?? ""}`} aria-label={`${count} round ${count === 1 ? "invite" : "invites"}`}>{count > 9 ? "9+" : count}</span>;
}
