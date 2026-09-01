"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, ListOrdered, Video, Users, MoreHorizontal } from "lucide-react";
import { MORE_LINKS } from "./MorePanel";

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/leaderboard", label: "Leaderboard", icon: ListOrdered },
  { href: "/watch-live", label: "Watch Live", icon: Video },
  { href: "/teams", label: "Teams", icon: Users },
];

export function MobileTabBar({ onMoreClick }: { onMoreClick: () => void }) {
  const pathname = usePathname();
  const moreOn = MORE_LINKS.some((l) => pathname.startsWith(l.href));

  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-[100] flex h-20 items-stretch bg-maroon-900 shadow-[0_-2px_8px_rgba(0,0,0,0.25)] pb-[calc(env(safe-area-inset-bottom)+2.5vh)]">
      {TABS.map((tab) => {
        const on = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={["flex flex-1 flex-col items-center justify-start gap-1 pt-2.5 font-condensed text-3xs font-semibold uppercase tracking-wide", on ? "text-white" : "text-white/60"].join(" ")}
          >
            <Icon size={18} />
            {tab.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMoreClick}
        className={["flex flex-1 flex-col items-center justify-start gap-1 pt-2.5 font-condensed text-3xs font-semibold uppercase tracking-wide", moreOn ? "text-white" : "text-white/60"].join(" ")}
      >
        <MoreHorizontal size={18} />
        More
      </button>
    </nav>
  );
}
