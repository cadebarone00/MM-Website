import Link from "next/link";
import { notFound } from "next/navigation";
import { HoleDetailCard } from "@/components/scorecard/HoleDetailCard";
import { ShotVideoPanel } from "@/components/scorecard/ShotVideoPanel";
import { LiveHoleDetail } from "@/components/scorecard/LiveHoleDetail";
import { pastTournaments, nextTournament, getTournament, getHoleStat, getRoundScorecard, playersOf } from "@/lib/data";

export function generateStaticParams() {
  return pastTournaments.flatMap((t) =>
    (t.scorecards ?? []).flatMap((sc) =>
      sc.rounds.flatMap((r) =>
        r.holes.map((h) => ({
          slug: t.slug,
          player: sc.player.toLowerCase(),
          round: String(r.round),
          hole: String(h.hole),
        }))
      )
    )
  );
}

export default async function HoleDetailPage({
  params,
}: {
  params: Promise<{ slug: string; player: string; round: string; hole: string }>;
}) {
  const { slug, player, round, hole } = await params;

  if (slug === nextTournament.slug) {
    return (
      <div className="max-w-[800px] mx-auto px-7 pt-8 pb-16">
        <LiveHoleDetail tournamentSlug={slug} player={player} round={Number(round)} hole={Number(hole)} />
      </div>
    );
  }

  const tournament = getTournament(slug);
  if (!tournament) notFound();

  const entry = playersOf(tournament).find((p) => p.name.toLowerCase() === player.toLowerCase());
  if (!entry) notFound();

  const roundNum = Number(round);
  const holeNum = Number(hole);
  const holeStat = getHoleStat(tournament, entry.name, roundNum, holeNum);
  const roundCard = getRoundScorecard(tournament, entry.name, roundNum);
  if (!holeStat || !roundCard) notFound();

  return (
    <div className="max-w-[800px] mx-auto px-7 pt-8 pb-16">
      <Link
        href={`/leaderboard/${slug}/players/${player}`}
        className="font-condensed text-xs font-semibold tracking-wide uppercase text-ink-500 hover:text-maroon-700 transition-colors"
      >
        ← Back to {entry.name}&rsquo;s Scorecard
      </Link>

      <div className="mt-4 mb-6">
        <div className="font-condensed text-[11px] font-semibold tracking-eyebrow uppercase text-maroon-600 mb-[6px]">
          {tournament.editionLabel} · Round {roundCard.round} · {roundCard.course}
        </div>
        <h1 className="font-sans text-[32px] font-extrabold text-ink-900 m-0">
          {entry.name} · Hole {holeStat.hole}
        </h1>
      </div>

      <HoleDetailCard hole={holeStat} />

      <div className="mt-8">
        <div className="font-condensed text-3xs font-semibold tracking-eyebrow uppercase text-ink-400 mb-2">Hole Overview</div>
        <div className="aspect-[16/7] w-full flex flex-col items-center justify-center gap-2 bg-cream-100 border border-ink-100 rounded-md text-ink-400 mb-8">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span className="font-condensed text-xs font-semibold tracking-wide uppercase">Hole photos coming soon</span>
        </div>

        <ShotVideoPanel shotCount={holeStat.score} />
      </div>
    </div>
  );
}
