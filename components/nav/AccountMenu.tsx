"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useAccountSession, signOutAccount } from "@/lib/useAccountSession";
import type { AccountSession } from "@/lib/useAccountSession";
import { getPlayerDisplayName } from "@/lib/data/players";

const PERSONAL_LINKS = [
  { href: "/my-team", label: "My Team" },
  { href: "/fantasy", label: "Fantasy" },
  { href: "/vault", label: "The MM Vault" },
  { href: "/merchandise", label: "Merchandise" },
  { href: "/settings", label: "Settings" },
];

const INFO_LINKS = [
  { href: "/sponsorship", label: "Sponsorship Opportunities" },
  { href: "/players", label: "Learn More About the Players" },
];

function welcomeLabel(session: AccountSession): string {
  if (!session) return "Welcome";
  const firstName = session.kind === "host" ? session.username : getPlayerDisplayName(session.playerFirst).split(" ")[0];
  return `Welcome, ${firstName}`;
}

/** Personal-to-the-account-holder menu, opened from the header's account icon. Separate from MorePanel (site-wide pages) — this holds only things tied to the signed-in account. */
export function AccountMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useAccountSession();
  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-[110] flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
        <span className="font-sans text-lg font-bold text-ink-900">{welcomeLabel(session)}</span>
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-cream-50"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto">
        {PERSONAL_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onClose}
            className="border-b border-ink-100 px-5 py-4 font-sans text-base font-semibold text-ink-900 hover:bg-cream-50"
          >
            {link.label}
          </Link>
        ))}
        <div className="h-2 bg-cream-50" />
        {INFO_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onClose}
            className="border-b border-ink-100 px-5 py-4 font-sans text-base font-semibold text-ink-900 hover:bg-cream-50"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-ink-100 p-5">
        {session ? (
          <button
            type="button"
            onClick={() => {
              signOutAccount(session);
              onClose();
            }}
            className="w-full rounded-sm bg-maroon-700 px-5 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-cream-50"
          >
            Log Out
          </button>
        ) : (
          <div>
            <div className="flex gap-3">
              <button
                type="button"
                disabled
                title="Coming soon"
                className="flex-1 rounded-sm border border-ink-300 px-5 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-400"
              >
                Sign Up
              </button>
              <button
                type="button"
                disabled
                title="Coming soon"
                className="flex-1 rounded-sm border border-ink-300 px-5 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-400"
              >
                Login
              </button>
            </div>
            <Link
              href="/portal"
              onClick={onClose}
              className="mt-3 block text-center font-sans text-sm font-semibold text-maroon-700 underline underline-offset-2"
            >
              Already have a login? Portal
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
