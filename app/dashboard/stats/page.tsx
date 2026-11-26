import { redirect } from "next/navigation";
import { loadWebsiteGolf } from "@/lib/website/playerGolf";
import { WebsiteAccountActions } from "@/components/website/WebsiteAccountActions";
import { WebsiteStats, WebsiteUnfinished } from "@/components/website/WebsiteGolfPages";
import { INSIGHTS_RANGES, type InsightsRange } from "@/lib/insights/stats";

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const dynamic = "force-dynamic";
export const metadata = { title: "Stats | The Maroon", robots: { index: false, follow: false } };

/** Website → Stats: the full breakdown of the signed-in golfer's rounds (?range=last10|last20|year|all, ?only18=1). */
export default async function StatsPage({ searchParams }: { searchParams: Promise<{ sample?: string; range?: string; only18?: string }> }) {
  const params = await searchParams;
  const sample = params.sample === "1";
  const golf = await loadWebsiteGolf(sample);
  if (golf === "signed-out") redirect("/login/email?next=%2Fdashboard%2Fstats");
  if (golf === "unfinished") return <WebsiteUnfinished active="Stats" accountActions={<WebsiteAccountActions signedIn />} />;
  const range = INSIGHTS_RANGES.some(([id]) => id === params.range) ? params.range as InsightsRange : "all";
  return <WebsiteStats golf={golf} accountActions={<WebsiteAccountActions signedIn />} sampleQuery={sample ? "?sample=1" : ""}
    filter={{ range, only18: params.only18 === "1", today: new Date().toISOString().slice(0, 10) }} />;
}
