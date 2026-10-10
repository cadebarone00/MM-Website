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
import { SimulatorBridge } from "@/components/dev/SimulatorBridge";
import { PageScrollBackground } from "./PageScrollBackground";

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
  const content = (
    <div className="app-camera-buffer"><AreaNavigation>
      <RoundExitProvider>
        <WebsiteFrameBridge />
        <PageScrollBackground />
        <SiteChromeBody nextTournamentOverride={nextTournamentOverride}>{children}</SiteChromeBody>
      </RoundExitProvider>
    </AreaNavigation></div>
  );
  return process.env.NODE_ENV === "development" ? <SimulatorBridge>{content}</SimulatorBridge> : content;
}

function SiteChromeBody({ children, nextTournamentOverride }: { children: ReactNode; nextTournamentOverride: NextTournamentOverride }) {
  const pathname = usePathname();
  // The /dev/gps prototype is a full-screen map, so no header or bottom menu over it.
  if (pathname === "/dev" || pathname === "/new-user" || pathname === "/signup" || pathname === "/login" || pathname === "/dev/gps") return <>{children}</>;
  const hideBottomNav = isSiteBottomNavHidden(pathname);
  return (
    <>
      <div className={`app-camera-content ${hideBottomNav ? "" : SITE_BOTTOM_NAV_CONTENT_CLASS}`}>
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

  if (pathname === "/login/email") {
    return <div className="min-h-dvh"><PlatformHeader />{children}</div>;
  }
  // Main platform pages share a compact title beside the menu icon.
  if (pathname === "/") return <><PlatformHeader home title="The Maroon" />{children}</>;
  if (pathname === "/pickems" || pathname === "/profile") return <><PlatformHeader title={pathname === "/pickems" ? "Pick'ems" : "Profile"} />{children}</>;
  // Golf Trips on phones has no top bar: its photo panel and title run to the top of the screen. Wide screens have no
  // bottom menu, so they keep the menu and account buttons, floating transparent over the photo (owner request 2026-10-02).
  if (pathname === "/golf-trips") return <>
    <div className="hidden lg:absolute lg:inset-x-0 lg:top-0 lg:z-10 lg:block"><PlatformHeader wordmark={false} /></div>
    {children}
  </>;
  // The Golf Trip questionnaire has no header, like Create Tournament.
  if (pathname === "/golf-trips/new" || pathname.startsWith("/golf-trips/new/")) return <>{children}</>;
  // Golf Trip Home (draft and saved trips), Trip Settings and their local dev preview have no top nav either.
  if (pathname.startsWith("/golf-trips/") || pathname === "/dev/tournament" || pathname.startsWith("/dev/tournament/")) return <>{children}</>;
  // Play a round is app-only too: no website top nav.
  if (pathname.startsWith("/rounds/")) return <>{children}</>;

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
