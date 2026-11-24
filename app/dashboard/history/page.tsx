import { redirect } from "next/navigation";
import { loadWebsiteGolf } from "@/lib/website/playerGolf";
import { WebsiteAccountActions } from "@/components/website/WebsiteAccountActions";
import { WebsiteHistory, WebsiteUnfinished } from "@/components/website/WebsiteGolfPages";

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const dynamic = "force-dynamic";
export const metadata = { title: "History | The Maroon", robots: { index: false, follow: false } };

/** Website → History: every saved round (with its card), trips and tournaments, read-only. */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ sample?: string }> }) {
  const golf = await loadWebsiteGolf((await searchParams).sample === "1");
  if (golf === "signed-out") redirect("/login/email?next=%2Fdashboard%2Fhistory");
  if (golf === "unfinished") return <WebsiteUnfinished active="History" accountActions={<WebsiteAccountActions signedIn />} />;
  return <WebsiteHistory golf={golf} accountActions={<WebsiteAccountActions signedIn />} />;
}
