import { SectionHead } from "@/components/home/SectionHead";
import { LeaderboardRow } from "@/components/ui/LeaderboardRow";
import { defendingIndividualChampion } from "@/lib/data";
import type { Tournament } from "@/lib/data/types";

export function LeaderboardSection({ tournament, actionHref }: { tournament: Tournament; actionHref: string }) {
  const top = [...tournament.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
  const champion = defendingIndividualChampion(tournament);

  return (
    <section className="mt-9">
      <SectionHead eyebrow="Standings" title={`${tournament.year} Leaderboard`} action="Full board" actionHref={actionHref} />
      <div className="overflow-hidden rounded-lg border border-gold-400 bg-cream-50 shadow-lg">
        <LeaderboardRow header />
        <div className="h-[360px] overflow-y-auto">
          {top.length === 0 ? (
            <div className="flex h-full items-center justify-center px-5 text-center font-sans text-sm text-ink-400">
              No individual scores have posted yet.
            </div>
          ) : (
            top.map((player, index) => (
              <LeaderboardRow
                key={player.player}
                pos={index + 1}
                name={player.player}
                team={player.team}
                total={player.toPar}
                highlight={index === 0}
                href={`/leaderboard/${tournament.slug}/players/${player.player.toLowerCase()}`}
                defendingChampion={champion != null && player.player === champion}
                isWinner={tournament.individualChampion === player.player}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
