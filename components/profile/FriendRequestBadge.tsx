"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./FriendRequestBadge.module.css";

/**
 * A red count of friend requests waiting on me (Profile tab, the magnifying glass). Checks when the page changes and
 * every minute while the app is open; shows nothing at 0 or when signed out.
 */
export function FriendRequestBadge({ className }: { className?: string }) {
  const [count, setCount] = useState(0);
  const pathname = usePathname();
  useEffect(() => {
    let live = true;
    const check = () => fetch("/api/profile/friends", { cache: "no-store" }).then((r) => r.json() as Promise<{ count?: number }>)
      .then((body) => { if (live) setCount(body.count ?? 0); }).catch(() => {});
    void check();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void check(); }, 60000);
    return () => { live = false; window.clearInterval(timer); };
  }, [pathname]);
  if (!count) return null;
  return <span className={`${styles.badge} ${className ?? ""}`} aria-label={`${count} friend ${count === 1 ? "request" : "requests"}`}>{count > 9 ? "9+" : count}</span>;
}
