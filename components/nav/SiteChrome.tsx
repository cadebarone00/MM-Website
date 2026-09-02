"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PortalHeader } from "@/components/nav/PortalHeader";
import { PlayerAreaNav } from "@/components/nav/PlayerAreaNav";
import type { NextTournamentOverride } from "@/lib/data/types";

/**
 * Picks the site chrome for the current route. `/portal/*` (Portal,
 * Scoring) gets `PortalHeader` with no bottom tab bar and no Footer —
 * those are Website-only features. Everywhere else keeps the normal
 * `Header` + `Footer`, unchanged. `PlayerAreaNav` shows in both cases
 * (it already renders nothing for non-player sessions).
 */
export function SiteChrome({ children, nextTournamentOverride }: { children: ReactNode; nextTournamentOverride: NextTournamentOverride }) {
  const pathname = usePathname();
  const inPortal = pathname.startsWith("/portal");

  if (inPortal) {
    return (
      <>
        <PortalHeader />
        <PlayerAreaNav />
        {children}
      </>
    );
  }

  return (
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom)+2.5vh)] lg:pb-0">
      <Header nextTournamentOverride={nextTournamentOverride} />
      <PlayerAreaNav />
      {children}
      <Footer nextTournamentOverride={nextTournamentOverride} />
    </div>
  );
}
