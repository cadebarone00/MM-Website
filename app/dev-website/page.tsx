import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { MarketingWebsite } from "@/components/marketing/MarketingWebsite";

export const metadata: Metadata = {
  title: "The Maroon | Golf is better together",
  description: "A new home for golf trips, friendly competition, and the stories that stay with you. The Maroon app is coming soon.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true,
};

export default function WebsiteDevelopmentPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <MarketingWebsite />;
}
