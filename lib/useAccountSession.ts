"use client";

import { useEffect, useState } from "react";
import type { Team } from "@/lib/data/types";

const HOST_STORAGE_KEY = "mm-scorekeeper-host-session";
const PLAYER_STORAGE_KEY = "mm-scorekeeper-player-session";

interface StoredHostSession {
  token: string;
  expiresAt: number;
  username: string;
}

interface StoredPlayerSession {
  sessionToken: string;
  expiresAt: number;
  playerFirst: string;
  displayName: string;
  team: Team;
  logoutAfterMinutes: number;
}

export type AccountSession =
  | { kind: "host"; username: string }
  | { kind: "player"; playerFirst: string; displayName: string; team: Team; sessionToken: string }
  | null;

function readHostSession(): StoredHostSession | null {
  const raw = localStorage.getItem(HOST_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: StoredHostSession = JSON.parse(raw);
    if (parsed.expiresAt > Date.now()) return parsed;
  } catch {
    // fall through to clearing the stale/corrupt entry below
  }
  localStorage.removeItem(HOST_STORAGE_KEY);
  return null;
}

function readPlayerSession(): StoredPlayerSession | null {
  const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: StoredPlayerSession = JSON.parse(raw);
    if (parsed.expiresAt > Date.now()) return parsed;
  } catch {
    // fall through to clearing the stale/corrupt entry below
  }
  localStorage.removeItem(PLAYER_STORAGE_KEY);
  return null;
}

export function useAccountSession(): AccountSession {
  const [session, setSession] = useState<AccountSession>(null);

  useEffect(() => {
    async function sync() {
      const host = readHostSession();
      if (host) {
        setSession({ kind: "host", username: host.username });
        return;
      }

      const player = readPlayerSession();
      if (!player) {
        setSession(null);
        return;
      }

      try {
        const res = await fetch("/portal/api/player-whoami", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken: player.sessionToken }),
        });
        if (!res.ok) {
          // Backend unreachable / erroring (e.g. 502) is not the same as an
          // explicit rejection of this token — fall back like a network error.
          throw new Error(`player-whoami request failed with status ${res.status}`);
        }
        const data = await res.json();
        if (data.ok) {
          const refreshed: StoredPlayerSession = {
            sessionToken: data.sessionToken,
            expiresAt: data.expiresAt,
            playerFirst: data.playerFirst,
            displayName: data.displayName,
            team: data.team,
            logoutAfterMinutes: data.logoutAfterMinutes,
          };
          localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(refreshed));
          setSession({
            kind: "player",
            playerFirst: refreshed.playerFirst,
            displayName: refreshed.displayName,
            team: refreshed.team,
            sessionToken: refreshed.sessionToken,
          });
        } else {
          localStorage.removeItem(PLAYER_STORAGE_KEY);
          setSession(null);
        }
      } catch {
        setSession({
          kind: "player",
          playerFirst: player.playerFirst,
          displayName: player.displayName,
          team: player.team,
          sessionToken: player.sessionToken,
        });
      }
    }

    void sync();
    window.addEventListener("storage", sync);
    window.addEventListener("mm:player-session-changed", sync);
    window.addEventListener("mm:host-session-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("mm:player-session-changed", sync);
      window.removeEventListener("mm:host-session-changed", sync);
    };
  }, []);

  return session;
}

export function signOutAccount(session: AccountSession) {
  if (!session) return;
  if (session.kind === "host") {
    localStorage.removeItem(HOST_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("mm:host-session-changed"));
  } else {
    localStorage.removeItem(PLAYER_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("mm:player-session-changed"));
  }
}
