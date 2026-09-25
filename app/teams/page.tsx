import { redirect } from "next/navigation";
import { getSeasonCatalog } from "@/lib/data/seasonCatalog";
export const dynamic = "force-dynamic";
export default async function Index(){const catalog=await getSeasonCatalog();redirect("/teams/"+(catalog.leaderboardOpen?catalog.nextTournament.slug:catalog.latestCompleted.slug));}
