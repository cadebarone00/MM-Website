"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/Header";
import { PortalHeader } from "@/components/nav/PortalHeader";
import { PlayerAreaNav } from "@/components/nav/PlayerAreaNav";
import type { NextTournamentOverride } from "@/lib/data/types";

/**
 * Picks the site chrome for the current route. `/broadcast` gets nothing at
 * all — no header, no footer, no nav — it's a TV-style broadcast canvas,
 * not a webpage (see the Watch Live Broadcast spec, §6/§10). `/portal/*`
 * (Portal, Scoring) gets `PortalHeader` with no bottom tab bar and no
 * Footer — those are Website-only features. Everywhere else keeps the
 * normal `Header` + `Footer`, unchanged. `PlayerAreaNav` shows in the
 * portal/website cases (it already renders nothing for non-player
 * sessions).
 */
export function SiteChrome({ children, nextTournamentOverride }: { children: ReactNode; nextTournamentOverride: NextTournamentOverride }) {
  const pathname = usePathname();
  const inPortal = pathname.startsWith("/portal");
  const inBroadcast = pathname.startsWith("/broadcast");

  if (inBroadcast) {
    return <>{children}</>;
  }

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
    </div>
  );
}
