"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccountSession } from "@/lib/useAccountSession";

const SEGMENTS = [
  { href: "/", label: "Website" },
  { href: "/portal", label: "Portal" },
  { href: "/portal/scoring", label: "Scoring" },
] as const;

type SegmentHref = (typeof SEGMENTS)[number]["href"];

function activeSegment(pathname: string): SegmentHref {
  if (pathname.startsWith("/portal/scoring")) return "/portal/scoring";
  if (pathname.startsWith("/portal")) return "/portal";
  return "/";
}

/**
 * A persistent switcher between the three areas a player account has
 * access to — Website, Portal, Scoring — so they never have to go back to
 * the post-login fork screen (`/account/choose`) to move between them.
 * Rendered in the root layout for every page; renders nothing for fans,
 * Tiger, or signed-out visitors.
 */
export function PlayerAreaNav() {
  const session = useAccountSession();
  const pathname = usePathname();

  if (session?.kind !== "player") return null;

  const active = activeSegment(pathname);

  return (
    <nav className="flex h-11 items-stretch bg-maroon-900">
      {SEGMENTS.map((segment) => {
        const on = segment.href === active;
        return (
          <Link
            key={segment.href}
            href={segment.href}
            className={[
              "flex flex-1 items-center justify-center font-condensed text-xs font-bold uppercase tracking-wide transition-colors",
              on ? "bg-cream-50 text-maroon-700" : "text-white",
            ].join(" ")}
          >
            {segment.label}
          </Link>
        );
      })}
    </nav>
  );
}
