"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccountSession } from "@/lib/useAccountSession";

const SEGMENTS = [
  { href: "/", label: "Website" },
  { href: "/portal", label: "Portal" },
  { href: "/portal/scoring", label: "Scoring" },
] as const;

const TIGER_SEGMENTS = [
  { href: "/", label: "Website" },
  { href: "/portal/admin", label: "Tiger Center" },
] as const;

type SegmentHref = (typeof SEGMENTS)[number]["href"];

function activeSegment(pathname: string): SegmentHref {
  if (pathname.startsWith("/portal/scoring")) return "/portal/scoring";
  if (pathname.startsWith("/portal")) return "/portal";
  return "/";
}

function tigerActiveSegment(pathname: string): (typeof TIGER_SEGMENTS)[number]["href"] {
  return pathname.startsWith("/portal/admin") ? "/portal/admin" : "/";
}

function useHeaderOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    function measure() {
      const header = document.querySelector("header");
      setOffset(header ? header.getBoundingClientRect().height : 0);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return offset;
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
  const headerOffset = useHeaderOffset();

  if (session?.kind !== "player" && session?.kind !== "host") return null;

  const segments = session.kind === "host" ? TIGER_SEGMENTS : SEGMENTS;
  const active = session.kind === "host" ? tigerActiveSegment(pathname) : activeSegment(pathname);

  return (
    <nav className="sticky z-[210] flex h-12 items-stretch bg-maroon-900" style={{ top: headerOffset }}>
      {segments.map((segment) => {
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
