"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Flag, UserRound } from "lucide-react";
import { siteBottomNavTabActive } from "@/lib/navigation/siteBottomNav";
import styles from "./SiteBottomNav.module.css";

const TABS = [
  { href: "/tournaments/join", label: "Tourneys", icon: Flag },
  { href: "/account/choose", label: "Profile", icon: UserRound },
  { href: "/the-maroon", label: "Explore", icon: Compass },
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
