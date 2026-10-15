import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevProfileRounds } from "@/components/dev/DevProfileRounds";

export const metadata: Metadata = { title: "Link requests preview | The Maroon", robots: { index: false, follow: false } };

/**
 * DEV ONLY: the player-rounds store seen as the simulator's "Signed in as" account — answer History link requests
 * (sent from Golf Trip Settings → History), remove rounds, and switch Public / Private. Moved here from /dev/profile,
 * which now shows the real profile with sample data.
 */
export default function DevProfileRequestsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevProfileRounds />;
}
