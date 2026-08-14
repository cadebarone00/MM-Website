"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useAccountSession } from "@/lib/useAccountSession";

export const MORE_LINKS = [
  { href: "/schedule", label: "Schedule" },
  { href: "/history", label: "History" },
  { href: "/wagers", label: "Wagers" },
];

const OPEN_EVENT = "mm:open-more-menu";

/**
 * Requests that the More drawer open, from anywhere in the tree that
 * doesn't own its open/close state — e.g. the Wagers nav bar's "< More"
 * back button. Header.tsx owns the actual `moreOpen` state and listens
 * for this event.
 */
export function openMoreMenu(): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/** Subscribes to openMoreMenu() calls; returns an unsubscribe function. */
export function onOpenMoreMenuRequested(handler: () => void): () => void {
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}

/**
 * Full-screen on mobile, a 25%-width right-edge drawer on desktop — one
 * component, not two, since only one shape is ever visible at a time
 * (the `lg:` breakpoint that switches shape is the same one that switches
 * the nav itself between bottom bar and top bar).
 */
export function MorePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useAccountSession();
  if (!open) return null;

  const links =
    session?.kind === "player" || session?.kind === "host"
      ? [...MORE_LINKS, { href: "/portal", label: session.kind === "host" ? "Tiger Center" : "Player Portal" }]
      : MORE_LINKS;

  return (
    // z-[110] only orders this above MobileTabBar within <header>'s own stacking context (header itself is z-[100]) — not a page-wide guarantee.
    <div className="fixed inset-0 z-[110]">
      {/* Hidden below lg on purpose: the panel is full-screen there, so there's no visible backdrop to click — closing on mobile is via the X button only. */}
      <div className="hidden lg:block absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex flex-col bg-maroon-900 shadow-xl lg:inset-y-0 lg:left-auto lg:right-0 lg:w-1/4">
        <div className="flex items-center justify-between border-b border-white/15 px-5 py-4">
          <span className="font-sans text-lg font-bold text-white">More</span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex flex-col">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className="border-b border-white/10 px-5 py-4 font-sans text-base font-semibold text-white hover:bg-white/10"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
