import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { spectral, barlow, barlowCondensed } from "@/lib/fonts/brand";
import { ModalScrollLock } from "@/components/ModalScrollLock";
import { AppShell } from "@/components/app/AppShell";
import "@/lib/fonts/fallbacks.css";
import "./globals.css";

// The iPhone / Android app build's root layout (MAROON_APP_BUILD=1, project_specs.md "The Maroon as a real iPhone
// app"): the same fonts and styles as the website's app/layout.tsx, without its server reads — AppShell signs in on the
// phone and each screen loads its data from the live server.
export const metadata: Metadata = { title: "The Maroon" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", maximumScale: 1, userScalable: false };

export default function AppRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${spectral.variable} ${barlow.variable} ${barlowCondensed.variable}`}>
    <body className="min-h-screen bg-cream-50 font-sans text-ink-900 antialiased">
      <ModalScrollLock />
      <Suspense><AppShell>{children}</AppShell></Suspense>
    </body>
  </html>;
}
