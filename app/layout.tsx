import type { Metadata } from "next";
import { Spectral, Barlow, Barlow_Semi_Condensed } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

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
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
