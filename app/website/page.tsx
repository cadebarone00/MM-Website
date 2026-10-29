import { MarketingWebsite } from "@/components/marketing/MarketingWebsite";
import { WebsiteAccountActions } from "@/components/website/WebsiteAccountActions";
import { loadWebsitePlayer } from "@/lib/website/playerSession";

export const metadata = { title: "The Maroon | Golf is better together" };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

export default async function Home() {
  const player = await loadWebsitePlayer();
  return <MarketingWebsite accountActions={<WebsiteAccountActions signedIn={player !== null} />} />;
}
