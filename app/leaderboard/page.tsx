import { redirect } from "next/navigation";
import { nextTournament, latestCompleted, isPastLeaderboardSwitchover } from "@/lib/data";

export default function LeaderboardIndex() {
  const slug = isPastLeaderboardSwitchover() ? nextTournament.slug : latestCompleted.slug;
  redirect(`/leaderboard/${slug}`);
}
