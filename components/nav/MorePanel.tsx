"use client";

import Link from "next/link";
import Image from "next/image";
import { maroonCategories } from "@/lib/data/theMaroon";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useAccountSession } from "@/lib/useAccountSession";

export const MORE_LINKS = [
  { href: "/schedule", label: "Schedule" },
  { href: "/history", label: "History" },
  { href: "/wagers", label: "Wagers" },
  { href: "/fantasy", label: "Fantasy" },
];

// Shown as an icon row under the last More link, in this order. An empty
// href hides that icon until the account link is filled in.
const SOCIAL_LINKS: { label: string; href: string; icon: ReactNode }[] = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/themaroonmasters/",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20} aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: "Facebook",
    href: "",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20} aria-hidden="true">
        <path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.5 1.6-1.5h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.4 0-4.1 1.5-4.1 4.2v2.3H7.5V14h2.7v8h3.3z" />
      </svg>
    ),
  },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@maroonmasters",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20} aria-hidden="true">
        <path d="M16.6 3c.3 2.2 1.6 3.6 3.9 3.8v2.6c-1.4.1-2.7-.3-3.9-1v5.9c0 3.8-2.9 5.9-5.8 5.7-2.9-.2-5-2.6-4.8-5.5.3-3.2 3.3-5.3 6.5-4.6v2.8c-.4-.1-.8-.2-1.2-.2-1.4 0-2.5 1.1-2.4 2.5.1 1.3 1.1 2.3 2.4 2.3 1.4 0 2.4-1 2.4-2.6V3h2.9z" />
      </svg>
    ),
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/channel/UCEtpZLOqQB-vie93NHSqIfw",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width={20} height={20} aria-hidden="true">
        <path d="M21.6 7.2c-.2-.9-.9-1.6-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4c-.9.2-1.6.9-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8c.2.9.9 1.6 1.8 1.8 1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3L10 15z" />
      </svg>
    ),
  },
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
    session?.kind === "host"
      ? [...MORE_LINKS, { href: "/portal", label: "Tiger Center" }]
      : MORE_LINKS;

  return (
    // z-[110] only orders this above MobileTabBar within <header>'s own stacking context (header itself is z-[100]) — not a page-wide guarantee.
    <div className="fixed inset-0 z-[110]">
      {/* Hidden below lg on purpose: the panel is full-screen there, so there's no visible backdrop to click — closing on mobile is via the X button only. */}
      <div className="hidden lg:block absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex flex-col overflow-y-auto bg-maroon-900 pb-[env(safe-area-inset-bottom)] shadow-xl lg:inset-y-0 lg:left-auto lg:right-0 lg:w-1/4">
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
        <div className="flex items-center gap-3 px-5 py-5">
          {SOCIAL_LINKS.filter((social) => social.href).map((social) => (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`The Maroon Masters ${social.label}`}
              title={`The Maroon Masters ${social.label}`}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              {social.icon}
            </a>
          ))}
        </div>
        <section aria-label="The Maroon" className="px-5 pb-6">
          <Link href="/the-maroon" onClick={onClose} className="relative flex min-h-28 items-end overflow-hidden rounded-lg border border-gold-400 bg-maroon-800 p-4 text-white">
            <Image src="/schedule/mission-hills.webp" alt="" fill sizes="(max-width: 1024px) 100vw, 25vw" className="object-cover" />
            <span className="absolute inset-0 bg-gradient-to-t from-black/80 to-black/10" />
            <span className="relative"><span className="block font-title text-2xl font-bold">The Maroon</span><span className="font-condensed text-[10px] uppercase tracking-widest text-white/80">Home · Our golf journal</span></span>
          </Link>
          <nav aria-label="The Maroon categories" className="mt-2 grid grid-cols-2 gap-2">
            {maroonCategories.map((category) => <Link key={category.slug} href={`/the-maroon/${category.slug}`} onClick={onClose} className="rounded-md border border-white/20 px-3 py-2.5 text-center font-condensed text-xs font-semibold uppercase tracking-wide text-white hover:bg-white/10">{category.label}</Link>)}
          </nav>
        </section>
      </div>
    </div>
  );
}
