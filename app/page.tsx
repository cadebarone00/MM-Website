import { redirect } from "next/navigation";
import { PlatformHome } from "@/components/platform/PlatformHome";
import { skipSignInWall } from "@/lib/dev/signInWall";
import { loadPlayData } from "@/lib/content/playData";
export const metadata = { title: "The Maroon", description: "The digital home for competitive golf trips." };

export default async function Home() {
  const { signedIn, ribbon } = await loadPlayData();
  if (!signedIn && !skipSignInWall()) redirect("/new-user");
  return <PlatformHome signedIn={signedIn} ribbon={ribbon} />;
}
