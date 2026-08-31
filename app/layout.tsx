import type { Metadata, Viewport } from "next";
import { Spectral, Barlow, Barlow_Semi_Condensed } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/nav/SiteChrome";

const spectral = Spectral({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-spectral",
});

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-barlow",
});

const barlowCondensed = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow-condensed",
});

export const metadata: Metadata = {
  title: "The Maroon Masters — Live",
  description: "The Maroon Masters — a fictional invitational match-play golf championship. Live leaderboard, pairings, and team rosters.",
};

// Lock the page to the device's own width and disable pinch-zoom — without
// this, a user zooming out shrinks the layout viewport itself, which throws
// off the scorecard's fixed-to-screen-width swipe pages.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spectral.variable} ${barlow.variable} ${barlowCondensed.variable}`}
    >
      <body className="min-h-screen bg-cream-50 font-sans text-ink-900 antialiased">
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
