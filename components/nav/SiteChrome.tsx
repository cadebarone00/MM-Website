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
import { SiteBottomNav } from "@/components/nav/SiteBottomNav";
import type { NextTournamentOverride } from "@/lib/data/types";
import { isSiteBottomNavHidden, SITE_BOTTOM_NAV_CONTENT_CLASS } from "@/lib/navigation/siteBottomNav";
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
  return (
    <AreaNavigation>
      <RoundExitProvider>
        <WebsiteFrameBridge />
        <SiteChromeBody nextTournamentOverride={nextTournamentOverride}>{children}</SiteChromeBody>
      </RoundExitProvider>
    </AreaNavigation>
  );
}

function SiteChromeBody({ children, nextTournamentOverride }: { children: ReactNode; nextTournamentOverride: NextTournamentOverride }) {
  const pathname = usePathname();
  const hideBottomNav = isSiteBottomNavHidden(pathname);
  return (
    <>
      <div className={hideBottomNav ? undefined : SITE_BOTTOM_NAV_CONTENT_CLASS}>
        <AreaChrome nextTournamentOverride={nextTournamentOverride}>{children}</AreaChrome>
      </div>
      {!hideBottomNav && <SiteBottomNav />}
    </>
  );
}

function AreaChrome({ children, nextTournamentOverride }: { children: ReactNode; nextTournamentOverride: NextTournamentOverride }) {
  const pathname = usePathname();
  const inPortal = pathname.startsWith("/portal");
  const inBroadcast = pathname.startsWith("/broadcast");
  // Customer tournament sites (/t/...) bring their own header, nav and footer
  // from the public UI kit — never The Maroon's chrome, countdown or champions ribbon.
  // The organizer studio (/tournaments/..., including its preview) and platform
  // administration (/admin/...) bring their own neutral OrganizerStudioShell instead.
  // The logged-in Tournament Home (/play/...) and its local dev demo (/dev/play) bring their own app shell and bottom navigation.
  const inCustomerTournamentSite = pathname === "/t" || pathname.startsWith("/t/") || pathname === "/tournaments" || pathname.startsWith("/tournaments/") || pathname.startsWith("/admin/") || pathname.startsWith("/play/") || pathname === "/dev/play" || pathname.startsWith("/dev/play/");

  if (inBroadcast || inCustomerTournamentSite || pathname === "/portal/admin/scoring-preview/mobile") {
    return <>{children}</>;
  }

  if (pathname === "/login" || pathname === "/signup") {
    return <div className="min-h-dvh"><PlatformHeader />{children}</div>;
  }
  // Main platform pages share a compact title beside the menu icon.
  if (pathname === "/") return <><PlatformHeader home title="The Maroon" />{children}</>;
  if (pathname === "/pickems" || pathname === "/profile") return <><PlatformHeader title={pathname === "/pickems" ? "Pick'ems" : "Profile"} />{children}</>;
  // Golf Trips: menu and account buttons only, no title (owner request 2026-10-02).
  if (pathname === "/golf-trips") return <><PlatformHeader wordmark={false} />{children}</>;
  // The Golf Trip questionnaire has no header, like Create Tournament.
  if (pathname === "/golf-trips/new" || pathname.startsWith("/golf-trips/new/")) return <>{children}</>;
  // Golf Trip Home (draft and saved trips), Trip Settings and their local dev preview have no top nav either.
  if (pathname.startsWith("/golf-trips/") || pathname === "/dev/tournament" || pathname.startsWith("/dev/tournament/")) return <>{children}</>;

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
    <>
      <Header nextTournamentOverride={nextTournamentOverride} />
      <InstallPrompt />
      <PlayerAreaNav />
      {children}
      <Footer nextTournamentOverride={nextTournamentOverride} showSponsors={pathname === "/website"} />
    </>
  );
}
