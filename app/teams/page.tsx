import { redirect } from "next/navigation";
import { latestCompleted, nextTournament, isLiveNow } from "@/lib/data";

export default function TeamsIndex() {
  redirect(`/teams/${isLiveNow() ? nextTournament.slug : latestCompleted.slug}`);
}
