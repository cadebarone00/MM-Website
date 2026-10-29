import { redirect } from "next/navigation";
import { loadWebsitePlayer } from "@/lib/website/playerSession";
import { WebsiteAccountActions } from "@/components/website/WebsiteAccountActions";
import { WebsiteAccountDashboard } from "@/components/marketing/WebsiteAccountDashboard";

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const dynamic = "force-dynamic";
export const metadata = { title: "Player Dashboard | The Maroon", robots: { index: false, follow: false } };

export default async function DashboardPage() {
  const player = await loadWebsitePlayer();
  if (!player) redirect("/login/email?next=%2Fdashboard");
  return <WebsiteAccountDashboard player={player} websiteHref="/website" accountActions={<WebsiteAccountActions signedIn />} />;
}
