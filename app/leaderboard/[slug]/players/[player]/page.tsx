import { notFound } from "next/navigation";
import { PlayerScorecardView } from "@/components/scorecard/PlayerScorecardView";
import { PlayerProfileHeader } from "@/components/scorecard/PlayerProfileHeader";
import { LivePlayerScorecard } from "@/components/scorecard/LivePlayerScorecard";
import { pastTournaments, nextTournament, getTournament, getPlayerScorecard, playersOf } from "@/lib/data";
import { getPlayerAvatar, getPlayerDisplayName, getPlayerProfile } from "@/lib/data/players";
import { getScorecardsForTournament } from "@/lib/data/archivedScorecards";

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

  const scorecards = await getScorecardsForTournament(tournament);
  const tournamentWithScorecards = { ...tournament, scorecards };

  const entry = playersOf(tournament).find((p) => p.name.toLowerCase() === player.toLowerCase());
  if (!entry) notFound();

  const scorecard = getPlayerScorecard(tournamentWithScorecards, entry.name);
  const displayName = getPlayerDisplayName(entry.name);
  const avatar = getPlayerAvatar(entry.name);

  const ranked = [...tournamentWithScorecards.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
  const standing = ranked.find((p) => p.player.toLowerCase() === player.toLowerCase());
  const position = standing ? ranked.indexOf(standing) + 1 : null;
  const total = standing?.toPar ?? null;
  const lastRound = scorecard?.rounds[scorecard.rounds.length - 1];
  const playedCount = lastRound?.holes.filter((h) => h.score > 0).length ?? 0;
  const thru = lastRound == null ? null : playedCount >= lastRound.holes.length ? "F" : String(playedCount);

  return (
    <div className="max-w-[1200px] mx-auto px-7 pt-8 pb-16">
      <PlayerProfileHeader
        backHref={`/leaderboard/${slug}`}
        backLabel={`Back to ${tournamentWithScorecards.editionLabel} Leaderboard`}
        displayName={displayName}
        avatarSrc={avatar}
        team={entry.team}
        editionLabel={tournamentWithScorecards.editionLabel}
        bio={getPlayerProfile(entry.name)?.bio ?? null}
        live={false}
        position={position}
        total={total}
        thru={thru}
      />

      {scorecard ? (
        <PlayerScorecardView scorecard={scorecard} tournament={tournamentWithScorecards} />
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
