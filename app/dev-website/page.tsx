import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { MarketingWebsite } from "@/components/marketing/MarketingWebsite";
import { WebsitePlayerDashboard } from "@/components/marketing/WebsitePlayerDashboard";
import { loadWebsitePlayer } from "@/lib/website/playerSession";
import { WebsiteAccountActions } from "@/components/website/WebsiteAccountActions";
import { MaroonLiveDirectory } from "@/components/tap-in/MaroonLiveDirectory";
import { liveTripMockCount } from "@/lib/website/liveTripMocks";

export const metadata: Metadata = {
  title: "The Maroon | Golf is better together",
  description: "A new home for golf trips, friendly competition, and the stories that stay with you. The Maroon app is coming soon.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true,
};

export default async function WebsiteDevelopmentPage({ searchParams }: { searchParams: Promise<{ view?: string | string[]; trips?: string | string[] }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { view, trips } = await searchParams;
  if (view === "live") return <MaroonLiveDirectory count={liveTripMockCount(trips)} />;
  if (view === "dashboard") return <WebsitePlayerDashboard />;
  const player = await loadWebsitePlayer();
  return <MarketingWebsite accountActions={<WebsiteAccountActions signedIn={player !== null} />} />;
}
