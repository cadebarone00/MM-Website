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

export async function signOutAccount(): Promise<void> {
  await fetch("/api/auth/signout", { method: "POST" });
  window.dispatchEvent(new CustomEvent("mm:session-changed"));
}
