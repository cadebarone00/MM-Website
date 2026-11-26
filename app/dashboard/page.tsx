import { redirect } from "next/navigation";
import { loadWebsiteGolf } from "@/lib/website/playerGolf";
import { WebsiteAccountActions } from "@/components/website/WebsiteAccountActions";
import { WebsiteDashboard, WebsiteUnfinished } from "@/components/website/WebsiteGolfPages";

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const dynamic = "force-dynamic";
export const metadata = { title: "Player Dashboard | The Maroon", robots: { index: false, follow: false } };

/** The signed-in golfer's dashboard: each part of their golf, Connected, with a way in (project_specs.md "Connected dashboard"). */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ sample?: string }> }) {
  const sample = (await searchParams).sample === "1";
  const golf = await loadWebsiteGolf(sample);
  if (golf === "signed-out") redirect("/login/email?next=%2Fdashboard");
  if (golf === "unfinished") return <WebsiteUnfinished active="" accountActions={<WebsiteAccountActions signedIn />} />;
  return <WebsiteDashboard golf={golf} accountActions={<WebsiteAccountActions signedIn />} sampleQuery={sample ? "?sample=1" : ""} />;
}
