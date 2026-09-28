"use client";

import { useEffect, useState } from "react";
import type { Team } from "@/lib/data";

export type AccountSession =
  | { kind: "host"; username: string; displayName: string }
  | { kind: "player"; playerSlug: string; username: string; displayName: string; team: Team | null }
  | { kind: "fan"; username: string; displayName: string }
  | null;

export function useAccountSession(): AccountSession {
  const [session, setSession] = useState<AccountSession>(null);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      try {
        const res = await fetch("/api/account/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSession(data.session);
      } catch {
        // Network hiccup — leave the last known session in place rather than
        // flashing to signed-out.
      }
    }

    void sync();
    window.addEventListener("mm:session-changed", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("mm:session-changed", sync);
    };
  }, []);

  return session;
}

/** Ends the session, then does a full page load of the home page so the person lands there as a signed-out guest (leaving /portal and dropping any in-memory state). */
export async function signOutAccount(): Promise<void> {
  const res = await fetch("/api/auth/signout", { method: "POST" });
  if (!res.ok) throw new Error(`Sign out failed (${res.status})`);
  // Deliberately a full load, not router.push: nothing from the signed-in session survives.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/");
}
