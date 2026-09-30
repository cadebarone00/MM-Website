"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MaroonHeader } from "@/components/maroon/MaroonHeader";
import { PlatformHeader } from "@/components/platform/PlatformHeader";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PortalHeader } from "@/components/nav/PortalHeader";
import { PlayerAreaNav } from "@/components/nav/PlayerAreaNav";
import type { NextTournamentOverride } from "@/lib/data/types";
import { AreaNavigation } from "./AreaNavigation";
import { RoundExitProvider } from "./RoundExit";
import { WebsiteFrameBridge } from "@/components/portal/admin/WebsiteFrameBridge";

/**
 * Picks the site chrome for the current route. `/broadcast` and customer
 * tournament sites (`/t/...`, which use the public tournament UI kit) get
 * nothing at all — no header, no footer, no nav — it's a TV-style broadcast canvas,
 * not a webpage (see the Watch Live Broadcast spec, §6/§10). The organizer
 * studio (`/tournaments/...`) is also left bare: it renders its own neutral
 * `OrganizerStudioShell`. `/portal/*`
 * (Portal, Scoring) gets `PortalHeader` with no bottom tab bar and no
 * Footer — those are Website-only features. Everywhere else gets its
 * header (`MaroonHeader` on home/The Maroon, `Header` elsewhere) plus the
 * desktop-only `Footer`. `PlayerAreaNav` shows in the
 * portal/website cases (it already renders nothing for non-player
 * sessions).
 */
export function SiteChrome({ children, nextTournamentOverride }: { children: ReactNode; nextTournamentOverride: NextTournamentOverride }) {
  return <AreaNavigation><RoundExitProvider><WebsiteFrameBridge /><AreaChrome nextTournamentOverride={nextTournamentOverride}>{children}</AreaChrome></RoundExitProvider></AreaNavigation>;
}

function AreaChrome({ children, nextTournamentOverride }: { children: ReactNode; nextTournamentOverride: NextTournamentOverride }) {
  const pathname = usePathname();
  const inPortal = pathname.startsWith("/portal");
  const inBroadcast = pathname.startsWith("/broadcast");
  // Customer tournament sites (/t/...) bring their own header, nav and footer
  // from the public UI kit — never The Maroon's chrome, countdown or champions ribbon.
  // The organizer studio (/tournaments/..., including its preview) and platform
  // administration (/admin/...) bring their own neutral OrganizerStudioShell instead.
  const inCustomerTournamentSite = pathname === "/t" || pathname.startsWith("/t/") || pathname === "/tournaments" || pathname.startsWith("/tournaments/") || pathname.startsWith("/admin/");

  if (inBroadcast || inCustomerTournamentSite || pathname === "/portal/admin/scoring-preview/mobile") {
    return <>{children}</>;
  }

  if (pathname === "/login" || pathname === "/signup") {
    return <div className="min-h-dvh"><PlatformHeader />{children}</div>;
  }
  if (pathname === "/") return <><PlatformHeader />{children}</>;

  if (inPortal) {
    return (
      <>
        <PortalHeader />
        <PlayerAreaNav />
        {children}
      </>
    );
  }

  if (pathname === "/" || pathname === "/contact" || pathname === "/login" || pathname === "/signup" || pathname === "/the-maroon" || pathname.startsWith("/the-maroon/")) {
    return <><MaroonHeader />{children}<Footer nextTournamentOverride={nextTournamentOverride} /></>;
  }

  return (
    <div className="pb-[calc(5rem+env(safe-area-inset-bottom)+2.5vh)] lg:pb-0">
      <Header nextTournamentOverride={nextTournamentOverride} />
      <InstallPrompt />
      <PlayerAreaNav />
      {children}
      <Footer nextTournamentOverride={nextTournamentOverride} showSponsors={pathname === "/website"} />
    </div>
  );
}
