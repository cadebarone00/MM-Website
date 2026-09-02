"use client";

import { useParams } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { PlayerFutureCard } from "@/components/wagers/PlayerFutureCard";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { PLAYER_FUTURES, playerFutureMarket } from "@/lib/wagers/marketKeys";

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
  return (
    <div className="px-4 pt-5 sm:px-7">
      <div className="flex items-center gap-3">
        <Avatar name={profile.fullName} src={profile.avatarSrc} size="lg" team={team} />
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">{profile.fullName}</h2>
      </div>

      <section className="mt-7">
        <h3 className="m-0 font-sans text-base font-black text-ink-900">Futures</h3>
        <div className="mt-2 flex flex-col gap-2">
          {PLAYER_FUTURES.map((future) => (
            <PlayerFutureCard key={future.id} future={future} market={playerFutureMarket(tournament.slug, profile.id, future)} />
          ))}
        </div>
      </section>

      <section className="mt-7">
        <h3 className="m-0 font-sans text-base font-black text-ink-900">Rounds</h3>
      </section>
    </div>
  );
}
