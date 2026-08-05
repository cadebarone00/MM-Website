"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { TigerAvatar } from "@/components/ui/TigerAvatar";
import { useAccountSession, signOutAccount } from "@/lib/useAccountSession";
import { getPlayerAvatar } from "@/lib/data/players";

export function AccountBadge({ position }: { position: "header" | "footer" }) {
  const session = useAccountSession();
  const [open, setOpen] = useState(false);

  if (!session) {
    if (position !== "footer") {
      return (
        <div className="flex items-center gap-2">
          <Link href="/login" className="font-sans text-sm font-semibold text-white/90 hover:text-white">
            Login
          </Link>
          <Link
            href="/signup"
            className="rounded-full border border-white/30 px-3 py-1.5 font-sans text-sm font-semibold text-white hover:bg-white/10"
          >
            Sign Up
          </Link>
        </div>
      );
    }
    return (
      <Link
        href="/login"
        aria-label="Login"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9"
      >
        <Avatar size="xs" />
      </Link>
    );
  }

  const label = session.kind === "host" ? session.username : session.displayName;
  const portalLabel = session.kind === "host" ? "Tiger Center" : session.kind === "player" ? "Player Portal" : null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Your account"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9"
      >
        {session.kind === "host" ? (
          <TigerAvatar size="xs" />
        ) : session.kind === "player" ? (
          <Avatar name={label} src={getPlayerAvatar(session.playerSlug)} size="xs" team={session.team} />
        ) : (
          <Avatar name={label} size="xs" />
        )}
      </button>

      {open && (
        <div
          className={[
            "absolute right-0 w-48 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-xl",
            position === "footer" ? "bottom-full mb-2" : "top-full mt-2",
          ].join(" ")}
        >
          <div className="px-4 py-3 font-sans text-sm font-semibold text-ink-900 border-b border-ink-100">Hi, {label}</div>
          {portalLabel && (
            <Link
              href="/portal"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-4 py-3 font-sans text-sm text-ink-700 hover:bg-cream-50"
            >
              {portalLabel}
              <ChevronRight size={14} />
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              void signOutAccount();
              setOpen(false);
            }}
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
