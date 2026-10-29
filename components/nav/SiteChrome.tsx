"use client";

import type { ReactNode } from "react";
import { SeasonCatalogProvider, type SeasonCatalogData } from "@/components/SeasonCatalogProvider";
import { usePathname } from "next/navigation";
import { PlatformHeader } from "@/components/platform/PlatformHeader";
import { SiteBottomNav } from "@/components/nav/SiteBottomNav";
import { chromePathname, isSiteBottomNavHidden, SITE_BOTTOM_NAV_CONTENT_CLASS } from "@/lib/navigation/siteBottomNav";
import { AreaNavigation } from "./AreaNavigation";
import { RoundExitProvider } from "./RoundExit";
import { SimulatorBridge } from "@/components/dev/SimulatorBridge";
import { PageScrollBackground } from "./PageScrollBackground";

/** V2 owns app navigation. Marketing and Tap In own their web surfaces. */
export function SiteChrome({ children, catalog }: { children: ReactNode; catalog: SeasonCatalogData }) {
  const pathname = usePathname();
  if (["/website", "/dev-website", "/dashboard", "/tap-in", "/broadcast"].includes(pathname)) return children;
  const content = <div className="app-camera-buffer"><AreaNavigation><RoundExitProvider>
    <PageScrollBackground /><AppChrome>{children}</AppChrome>
  </RoundExitProvider></AreaNavigation></div>;
  return <SeasonCatalogProvider initial={catalog}>{process.env.NODE_ENV === "development" ? <SimulatorBridge>{content}</SimulatorBridge> : content}</SeasonCatalogProvider>;
}

function AppChrome({ children }: { children: ReactNode }) {
  const rawPathname = usePathname();
  const pathname = chromePathname(rawPathname);
  if (pathname === "/dev" || pathname.startsWith("/dev/auth/") || ["/new-user", "/signup", "/login", "/dev/gps"].includes(pathname) || pathname.startsWith("/dev/notifications/") || pathname === "/dev/brand" || pathname.startsWith("/dev/brand/")) return children;
  const hideBottomNav = isSiteBottomNavHidden(rawPathname);
  const ownShell = pathname === "/t" || pathname.startsWith("/t/") || pathname === "/tournaments" || pathname.startsWith("/tournaments/") || pathname.startsWith("/admin/") || pathname.startsWith("/play/") || pathname === "/dev/play" || pathname.startsWith("/dev/play/") || pathname.startsWith("/golf-trips/") || pathname === "/dev/tournament" || pathname.startsWith("/dev/tournament/") || pathname.startsWith("/rounds/") || pathname === "/dev/tourney";
  const title = pathname === "/" ? "The Maroon" : pathname === "/pickems" ? "Pick'ems" : pathname === "/settings" ? "Settings" : pathname === "/profile/search" ? "Find Golfers" : pathname === "/profile/friends" ? "Friends" : pathname === "/profile" || pathname.startsWith("/profile/") ? "Profile" : undefined;
  return <>
    <div className={`app-camera-content ${hideBottomNav ? "" : SITE_BOTTOM_NAV_CONTENT_CLASS}`}>
      {pathname === "/golf-trips" ? <div className="hidden lg:absolute lg:inset-x-0 lg:top-0 lg:z-10 lg:block"><PlatformHeader wordmark={false} /></div> : !ownShell && <PlatformHeader home={pathname === "/"} title={title} />}
      {children}
    </div>
    {!hideBottomNav && <SiteBottomNav />}
  </>;
}
