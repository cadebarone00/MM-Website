"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { Team } from "@/lib/data/types";

const PLAYER_STORAGE_KEY = "mm-scorekeeper-player-session";

interface PlayerSession {
  sessionToken: string;
  expiresAt: number;
  playerFirst: string;
  displayName: string;
  team: Team;
  logoutAfterMinutes: number;
}

function readStoredSession(): PlayerSession | null {
  const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: PlayerSession = JSON.parse(raw);
    if (parsed.expiresAt > Date.now()) return parsed;
  } catch {
    // fall through to clearing the stale/corrupt entry below
  }
  localStorage.removeItem(PLAYER_STORAGE_KEY);
  return null;
}

export function PlayerAccountMenu() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    async function sync() {
      const stored = readStoredSession();
      if (!stored) {
        setSession(null);
        return;
      }
      try {
        const res = await fetch("/portal/api/player-whoami", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken: stored.sessionToken }),
        });
        const data = await res.json();
        if (data.ok) {
          const refreshed: PlayerSession = {
            sessionToken: data.sessionToken,
            expiresAt: data.expiresAt,
            playerFirst: data.playerFirst,
            displayName: data.displayName,
            team: data.team,
            logoutAfterMinutes: data.logoutAfterMinutes,
          };
          localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(refreshed));
          setSession(refreshed);
        } else {
          localStorage.removeItem(PLAYER_STORAGE_KEY);
          setSession(null);
        }
      } catch {
        setSession(stored);
      }
    }

    void sync();
    window.addEventListener("storage", sync);
    window.addEventListener("mm:player-session-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("mm:player-session-changed", sync);
    };
  }, []);

  function signOut() {
    localStorage.removeItem(PLAYER_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("mm:player-session-changed"));
    setSession(null);
    setOpen(false);
  }

  if (!session) return null;

  const displayName = getPlayerDisplayName(session.playerFirst);
  const avatarSrc = getPlayerAvatar(session.playerFirst);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Your account"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9"
      >
        <Avatar name={displayName} src={avatarSrc} size="xs" team={session.team} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-xl">
          <div className="px-4 py-3 font-sans text-sm font-semibold text-ink-900 border-b border-ink-100">Hi, {displayName}</div>
          <Link
            href="/portal"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between px-4 py-3 font-sans text-sm text-ink-700 hover:bg-cream-50"
          >
            Player Portal
            <ChevronRight size={14} />
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center justify-between px-4 py-3 font-sans text-sm text-ink-700 hover:bg-cream-50"
          >
            Sign Out
            <LogOut size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
