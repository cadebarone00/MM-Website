import { redirect } from "next/navigation";
import { nextTournament } from "@/lib/data";

export default function LeaderboardIndex() {
  redirect(`/leaderboard/${nextTournament.slug}`);
}
