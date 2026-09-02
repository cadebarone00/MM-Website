import type { Metadata } from "next";
import { getBroadcastLeaderboard } from "@/lib/broadcast/leaderboardData";
import { BroadcastStage } from "@/components/broadcast/BroadcastStage";

export const metadata: Metadata = {
  title: "Watch Live — The Maroon Masters",
};

export const dynamic = "force-dynamic";

export default async function BroadcastPage() {
  const { standings } = await getBroadcastLeaderboard();
  return <BroadcastStage standings={standings} />;
}
