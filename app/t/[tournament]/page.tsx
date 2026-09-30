import { notFound, redirect } from "next/navigation";
import { latestPublicYear } from "@/lib/platform/publicSiteServer";

export const dynamic = "force-dynamic";

/** /t/[tournament] → the newest edition this visitor may see. */
export default async function TournamentLatestPage({ params }: { params: Promise<{ tournament: string }> }) {
  const { tournament } = await params;
  const year = await latestPublicYear(tournament);
  if (!year) notFound();
  redirect(`/t/${encodeURIComponent(tournament)}/${year}`);
}
