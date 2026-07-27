"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { TigerAvatar } from "@/components/ui/TigerAvatar";
import { useAccountSession, signOutAccount } from "@/lib/useAccountSession";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";

export function AccountBadge({ position }: { position: "header" | "footer" }) {
  const session = useAccountSession();
  const [open, setOpen] = useState(false);

  if (!session) {
    if (position !== "footer") return null;
    return (
      <Link
        href="/portal"
        aria-label="Player Portal"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9"
      >
        <Avatar size="xs" />
      </Link>
    );
  }

  const label = session.kind === "host" ? session.username : getPlayerDisplayName(session.playerFirst);
  const portalLabel = session.kind === "host" ? "Tiger Center" : "Player Portal";

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
        ) : (
          <Avatar name={label} src={getPlayerAvatar(session.playerFirst)} size="xs" team={session.team} />
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
          <Link
            href="/portal"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between px-4 py-3 font-sans text-sm text-ink-700 hover:bg-cream-50"
          >
            {portalLabel}
            <ChevronRight size={14} />
          </Link>
          <button
            type="button"
            onClick={() => {
              signOutAccount(session);
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
