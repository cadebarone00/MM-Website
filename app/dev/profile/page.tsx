import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevProfileRounds } from "@/components/dev/DevProfileRounds";

export const metadata: Metadata = { title: "Profile preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: Profile → Rounds from the shared player-rounds store, seen as the simulator's "Signed in as" account. */
export default function DevProfilePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevProfileRounds />;
}
