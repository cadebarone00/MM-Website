"use client";

import { useParams } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { OddsButton } from "@/components/wagers/OddsButton";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { playerBirdiesFutureMarket } from "@/lib/wagers/marketKeys";

export default function PlayerWagersPage() {
  const { player } = useParams<{ player: string }>();
  const profile = getPlayerProfileBySlug(player);
  const { tournament, loading, payload } = useLiveTournament();

  if (!profile) {
    return <p className="px-4 py-10 text-center font-sans text-sm text-ink-400 sm:px-7">Player not found.</p>;
  }

  if (loading && !payload) {
    return <p className="px-4 py-10 text-center font-sans text-sm text-ink-400 sm:px-7">Checking the live sheet...</p>;
  }

  const team = tournament.roster.maroon.includes(profile.id) ? "maroon" : tournament.roster.white.includes(profile.id) ? "white" : null;
  const market = playerBirdiesFutureMarket(tournament.slug, profile.id);
  const [yes, no] = market.selections;

  return (
    <div className="px-4 pt-5 sm:px-7">
      <div className="flex items-center gap-3">
        <Avatar name={profile.fullName} src={profile.avatarSrc} size="lg" team={team} />
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">{profile.fullName}</h2>
      </div>

      <section className="mt-7">
        <h3 className="m-0 font-sans text-base font-black text-ink-900">Futures</h3>
        <div className="mt-2 rounded-sm border border-gold-300 bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="m-0 font-sans text-sm font-semibold text-ink-900">Total Birdies</p>
              <p className="mt-1 font-condensed text-sm font-bold text-ink-500">Over 8.5</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <OddsButton marketKey={market.marketKey} selectionKey={yes.key} label={yes.label} odds={yes.odds} tone="yes" prefix="Yes" />
              <OddsButton marketKey={market.marketKey} selectionKey={no.key} label={no.label} odds={no.odds} tone="no" prefix="No" />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-7">
        <h3 className="m-0 font-sans text-base font-black text-ink-900">Rounds</h3>
      </section>
    </div>
  );
}
