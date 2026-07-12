import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { PlayerScorecardView } from "@/components/scorecard/PlayerScorecardView";
import { LivePlayerScorecard } from "@/components/scorecard/LivePlayerScorecard";
import { pastTournaments, nextTournament, getTournament, getPlayerScorecard, playersOf } from "@/lib/data";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";

export function generateStaticParams() {
  return pastTournaments.flatMap((t) =>
    playersOf(t).map(({ name }) => ({ slug: t.slug, player: name.toLowerCase() }))
  );
}

export default async function PlayerScorecardPage({ params }: { params: Promise<{ slug: string; player: string }> }) {
  const { slug, player } = await params;

  if (slug === nextTournament.slug) {
    return (
      <div className="max-w-[1200px] mx-auto px-7 pt-8 pb-16">
        <LivePlayerScorecard tournamentSlug={slug} player={player} />
      </div>
    );
  }

  const tournament = getTournament(slug);
  if (!tournament) notFound();

  const entry = playersOf(tournament).find((p) => p.name.toLowerCase() === player.toLowerCase());
  if (!entry) notFound();

  const scorecard = getPlayerScorecard(tournament, entry.name);
  const displayName = getPlayerDisplayName(entry.name);
  const avatar = getPlayerAvatar(entry.name);

  return (
    <div className="max-w-[1200px] mx-auto px-7 pt-8 pb-16">
      <Link
        href={`/leaderboard/${slug}`}
        className="font-condensed text-xs font-semibold tracking-wide uppercase text-ink-500 hover:text-maroon-700 transition-colors"
      >
        ← Back to {tournament.editionLabel} Leaderboard
      </Link>

      <div className="flex items-center gap-4 mt-4 mb-6">
        <Avatar name={displayName} src={avatar} size="lg" team={entry.team} />
        <div>
          <h1 className="font-sans text-[32px] font-extrabold text-ink-900 m-0">{displayName}</h1>
          <span className={["font-condensed text-xs font-semibold tracking-wide uppercase", entry.team === "maroon" ? "text-maroon-600" : "text-ink-500"].join(" ")}>
            {entry.team === "maroon" ? "Team Maroon" : "Team White"} · {tournament.editionLabel}
          </span>
        </div>
      </div>

      {scorecard ? (
        <PlayerScorecardView scorecard={scorecard} tournamentSlug={slug} />
      ) : (
        <div className="px-5 py-8 bg-cream-50 border border-ink-100 rounded-md text-center">
          <p className="font-sans text-sm text-ink-500 m-0">
            Hole-by-hole scorecard detail wasn&rsquo;t reliably recorded in the source data for this tournament and isn&rsquo;t available yet.
          </p>
        </div>
      )}
    </div>
  );
}
