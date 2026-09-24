import { redirect } from "next/navigation";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { getAllPlayerRows } from "@/lib/portal/allPlayers";
import { get2026SkinsResults, SKINS_YEAR } from "@/lib/skins/data";
import { pastTournaments } from "@/lib/data";
import { tournamentRoundSequence } from "@/lib/data/tournamentRoundSequence";
import { SkinsPageView } from "@/components/skins/SkinsPageView";
import { calculateRoundPayouts } from "@/lib/skins/payout";
import { isIndividualScoreFormat } from "@/lib/handicap/archiveIndex";
import { nameSkinOpponents } from "@/lib/skins/opponents";

export default async function SkinsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!await requirePlayer()) redirect("/portal");
  const tab = (await searchParams).tab === "payout" ? "payout" : "skins";
  const [results, directory] = await Promise.all([
    get2026SkinsResults().catch((error) => { console.error("Could not load skins leaderboard:", error); return null; }),
    getAllPlayerRows(),
  ]);
  const tournament = pastTournaments.find((entry) => entry.year === SKINS_YEAR);
  const sessions = tournament ? tournamentRoundSequence(tournament) : [];
  const eligibleRounds = sessions.flatMap((session, index) => isIndividualScoreFormat(session.format) ? [index + 1] : []);
  const payouts = results ? calculateRoundPayouts(Object.keys(results.totals), results.wins, eligibleRounds) : null;
  const names = new Map(directory.map((player) => [player.playerSlug, player.fullName]));
  const players = Object.entries(results?.totals ?? {}).map(([slug, total]) => ({
    slug, total, name: directory.find((player) => player.playerSlug === slug)?.fullName ?? slug,
    wins: (results?.wins ?? []).filter((win) => win.player === slug).map((win) => ({
      ...win, day: sessions[win.round - 1]?.day ?? null, session: sessions[win.round - 1]?.session ?? null,
      opponents: nameSkinOpponents(win.opponents, names),
    })),
  })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return <SkinsPageView tab={tab} year={SKINS_YEAR} totalSkins={results?.wins.length ?? null} players={players} sessions={sessions} eligibleRounds={eligibleRounds} payouts={payouts} />;
}
