import { WebsiteTutorials } from "@/components/marketing/WebsiteTabs";
import { WebsiteAccountActions } from "@/components/website/WebsiteAccountActions";
import { loadWebsitePlayer } from "@/lib/website/playerSession";

export const metadata = { title: "Tutorials | The Maroon" };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

export default async function Page() {
  const player = await loadWebsitePlayer();
  return <WebsiteTutorials accountActions={<WebsiteAccountActions signedIn={player !== null} />} />;
}
