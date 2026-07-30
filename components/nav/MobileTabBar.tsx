"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, ListOrdered, Users, MoreHorizontal } from "lucide-react";

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/leaderboard", label: "Leaderboard", icon: ListOrdered },
  { href: "/teams", label: "Teams", icon: Users },
];

export function MobileTabBar({ onMoreClick }: { onMoreClick: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-[100] flex h-16 items-stretch bg-maroon-900 shadow-[0_-2px_8px_rgba(0,0,0,0.25)]">
      {TABS.map((tab) => {
        const on = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={["flex flex-1 flex-col items-center justify-center gap-1 font-condensed text-3xs font-semibold uppercase tracking-wide", on ? "text-white" : "text-white/60"].join(" ")}
          >
            <Icon size={20} />
            {tab.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMoreClick}
        className="flex flex-1 flex-col items-center justify-center gap-1 font-condensed text-3xs font-semibold uppercase tracking-wide text-white/60"
      >
        <MoreHorizontal size={20} />
        More
      </button>
    </nav>
  );
}
