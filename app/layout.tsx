import { ModalScrollLock } from "@/components/ModalScrollLock";
import { getSeasonCatalog } from "@/lib/data/seasonCatalog";
import type { Metadata, Viewport } from "next";
import { spectral, barlow, barlowCondensed } from "@/lib/fonts/brand";
import "@/lib/fonts/fallbacks.css";
import "./globals.css";
import { SiteChrome } from "@/components/nav/SiteChrome";
import { cookies } from "next/headers";
import { appMode, MODE_COOKIE } from "@/lib/theme/appMode";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Maroon",
  description: "Golf trips, friendly competition, live scoring, and your golf community.",
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
  const [catalog, cookieStore] = await Promise.all([getSeasonCatalog(), cookies()]);
  // Settings → Appearance: Light on this device (dark = none).
  return (
    <html
      lang="en"
      className={`${spectral.variable} ${barlow.variable} ${barlowCondensed.variable}`}
      data-mode={appMode(cookieStore.get(MODE_COOKIE)?.value) === "light" ? "light" : undefined}
    >
      <body className="min-h-screen bg-cream-50 font-sans text-ink-900 antialiased">
        <ModalScrollLock />
        <SiteChrome catalog={catalog}>{children}</SiteChrome>
      </body>
    </html>
  );
}
