"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, UserRound } from "lucide-react";
import { siteBottomNavTabActive } from "@/lib/navigation/siteBottomNav";
import { LeaderboardIcon } from "./LeaderboardIcon";
import { PickemsIcon } from "./PickemsIcon";
import styles from "./SiteBottomNav.module.css";

const ICON_SIZE = 26;

const TABS = [
  { href: "/", label: "Explore", icon: Compass },
  { href: "/tournaments/join", label: "Tourneys", icon: LeaderboardIcon },
  { href: "/pickems", label: "Pick'ems", icon: PickemsIcon, size: 32 },
  { href: "/account/choose", label: "Profile", icon: UserRound },
] as const;

export function SiteBottomNav() {
  const pathname = usePathname();

  return (
    <nav data-site-bottom-nav className={styles.nav} aria-label="Site">
      {TABS.map((tab) => {
        const active = siteBottomNavTabActive(pathname, tab.href);
        const Icon = tab.icon;
        const size = "size" in tab ? tab.size : ICON_SIZE;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={styles.item}
            aria-current={active ? "page" : undefined}
          >
            {/* Oversized icons overlap their margin so every label stays on one line. */}
            <Icon size={size} style={{ margin: `${(ICON_SIZE - size) / 2}px 0` }} aria-hidden="true" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
