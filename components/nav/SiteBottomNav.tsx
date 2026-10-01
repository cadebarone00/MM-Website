"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, ListChecks, UserRound } from "lucide-react";
import { siteBottomNavTabActive } from "@/lib/navigation/siteBottomNav";
import { LeaderboardIcon } from "./LeaderboardIcon";
import styles from "./SiteBottomNav.module.css";

const TABS = [
  { href: "/", label: "Explore", icon: Compass },
  { href: "/tournaments/join", label: "Tourneys", icon: LeaderboardIcon },
  { href: "/pickems", label: "Pick'ems", icon: ListChecks },
  { href: "/account/choose", label: "Profile", icon: UserRound },
] as const;

export function SiteBottomNav() {
  const pathname = usePathname();

  return (
    <nav data-site-bottom-nav className={styles.nav} aria-label="Site">
      {TABS.map((tab) => {
        const active = siteBottomNavTabActive(pathname, tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={styles.item}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={22} aria-hidden="true" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
