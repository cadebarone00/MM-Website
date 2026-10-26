import { SeasonCatalogProvider } from "@/components/SeasonCatalogProvider";
import { ModalScrollLock } from "@/components/ModalScrollLock";
import { getSeasonCatalog } from "@/lib/data/seasonCatalog";
import type { Metadata, Viewport } from "next";
import { spectral, barlow, barlowCondensed } from "@/lib/fonts/brand";
import "@/lib/fonts/fallbacks.css";
import "./globals.css";
import { SiteChrome } from "@/components/nav/SiteChrome";
import { getNextTournamentOverride } from "@/lib/data/activeSeasonOverlay";
import { cookies } from "next/headers";
import { appMode, MODE_COOKIE } from "@/lib/theme/appMode";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Maroon — Live",
  description: "The Maroon Tournament — a fictional invitational match-play golf championship. Live leaderboard, pairings, and team rosters.",
};

// Lock the page to the device's own width and disable pinch-zoom — without
// this, a user zooming out shrinks the layout viewport itself, which throws
// off the scorecard's fixed-to-screen-width swipe pages.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [nextTournamentOverride, catalog, cookieStore] = await Promise.all([getNextTournamentOverride(), getSeasonCatalog(), cookies()]);
  // Settings → Appearance: Light on this device (dark = none).
  return (
    <html
      lang="en"
      className={`${spectral.variable} ${barlow.variable} ${barlowCondensed.variable}`}
      data-mode={appMode(cookieStore.get(MODE_COOKIE)?.value) === "light" ? "light" : undefined}
    >
      <body className="min-h-screen bg-cream-50 font-sans text-ink-900 antialiased">
        <ModalScrollLock />
        <SeasonCatalogProvider initial={catalog}><SiteChrome nextTournamentOverride={nextTournamentOverride}>{children}</SiteChrome></SeasonCatalogProvider>
      </body>
    </html>
  );
}
