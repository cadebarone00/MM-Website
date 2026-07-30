"use client";

import Link from "next/link";
import { X } from "lucide-react";

const MORE_LINKS = [
  { href: "/schedule", label: "Schedule" },
  { href: "/history", label: "History" },
];

/**
 * Full-screen on mobile, a 25%-width right-edge drawer on desktop — one
 * component, not two, since only one shape is ever visible at a time
 * (the `lg:` breakpoint that switches shape is the same one that switches
 * the nav itself between bottom bar and top bar).
 */
export function MorePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex flex-col bg-white shadow-xl lg:inset-y-0 lg:left-auto lg:right-0 lg:w-1/4">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <span className="font-sans text-lg font-bold text-ink-900">More</span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-cream-50"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex flex-col">
          {MORE_LINKS.map((link) => (
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
      </div>
    </div>
  );
}
