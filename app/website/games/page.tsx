import { WebsiteGames } from "@/components/marketing/WebsiteTabs";
import { WebsiteAccountActions } from "@/components/website/WebsiteAccountActions";
import { loadWebsitePlayer } from "@/lib/website/playerSession";

export const metadata = { title: "Game rules | The Maroon" };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

export default async function Page() {
  const player = await loadWebsitePlayer();
  return <WebsiteGames accountActions={<WebsiteAccountActions signedIn={player !== null} />} />;
}
