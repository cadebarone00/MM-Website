import { redirect } from "next/navigation";
import { loadWebsitePlayer } from "@/lib/website/playerSession";
import { loadTapInDisplay } from "@/lib/tap-in/display";
import { TapInDisplay } from "@/components/tap-in/TapInDisplay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Watch Live | Tap In", robots: { index: false, follow: false } };
export default async function BroadcastPage() {
  const player = await loadWebsitePlayer();
  if (!player) redirect("/login/email?next=%2Ftap-in");
  if (!player.complete) redirect("/profile");
  return <TapInDisplay initial={await loadTapInDisplay()} />;
}
