import { notFound, redirect } from "next/navigation";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { getAllPlayerRows } from "@/lib/portal/allPlayers";
import { getHandicapSummaryForPlayer } from "@/lib/handicap/data";
import { getArchivedHandicapRounds } from "@/lib/data/archivedScorecards";
import { combinedHandicapIndexes } from "@/lib/handicap/archiveIndex";
import { PlayerLookup } from "@/components/portal/PlayerLookup";

export default async function PlayerLookupPage({ searchParams }: { searchParams: Promise<{ player?: string | string[] }> }) {
  const viewer = await requirePlayer();
  if (!viewer) redirect("/portal");
  // Only public player identifiers and names cross the client boundary.
  const players = (await getAllPlayerRows()).map(({ playerSlug, fullName }) => ({ playerSlug, fullName })).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const { player } = await searchParams;
  const selected = player === undefined ? viewer.playerSlug : player;
  if (typeof selected !== "string" || !players.some(item => item.playerSlug === selected)) notFound();
  const [summary, archivedRounds] = await Promise.all([getHandicapSummaryForPlayer(selected), getArchivedHandicapRounds(selected)]);
  const fullSummary = { ...summary, ...combinedHandicapIndexes(summary.rounds, archivedRounds) };
  return <PlayerLookup key={selected} players={players} selected={selected} viewer={viewer.playerSlug} summary={fullSummary} archivedRounds={archivedRounds} />;
}
