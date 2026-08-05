"use client";

import { useAccountSession } from "@/lib/useAccountSession";
import { accountKey } from "@/lib/wagers/wallet";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getNextTournamentStatus } from "@/lib/data";
import { matchPropMarkets } from "@/lib/wagers/mockOdds";
import { SignInGate } from "./SignInGate";
import { BalancePill } from "./BalancePill";
import { CompactMatchRow } from "@/components/leaderboard/CompactMatchRow";
import { PropBetRow } from "./PropBetRow";
import { TeamFuturesCard } from "./TeamFuturesCard";
import { FuturesLadder } from "./FuturesLadder";
import { MyWagersList } from "./MyWagersList";

export function WagersHubContent() {
  const session = useAccountSession();
  const { tournament, loading, payload } = useLiveTournament();
  const isLive = getNextTournamentStatus() === "live";

  if (accountKey(session) == null) {
    return <SignInGate />;
  }

  if (loading && !payload) {
    return <p className="font-sans text-sm text-ink-400 py-10 text-center">Checking the live sheet...</p>;
  }

  const allPropMarkets = tournament.matches.flatMap((match) => matchPropMarkets(match));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="m-0 font-serif text-2xl font-bold text-ink-900">Wagers</h1>
        <BalancePill />
      </div>

      {!isLive && (
        <p className="font-sans text-sm text-ink-500">
          There&rsquo;s no live tournament right now — futures are still open, and matches will appear here once play starts.
        </p>
      )}

      <section>
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">Today&rsquo;s Matches</h2>
        <div className="mt-3 overflow-hidden rounded-md border border-ink-100 bg-white">
          {tournament.matches.length === 0 ? (
            <p className="p-4 font-sans text-sm text-ink-400">No matches posted yet.</p>
          ) : (
            tournament.matches.map((match) => <CompactMatchRow key={match.id} match={match} tournamentSlug={tournament.slug} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">Player Props</h2>
        <div className="mt-3 rounded-md border border-ink-100 bg-white p-4">
          {allPropMarkets.length === 0 ? (
            <p className="font-sans text-sm text-ink-400">No player props posted yet.</p>
          ) : (
            allPropMarkets.map((market) => <PropBetRow key={market.id} market={market} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">Futures</h2>
        <div className="mt-3 flex flex-col gap-4">
          <TeamFuturesCard tournament={tournament} />
          <FuturesLadder standings={tournament.individualLeaderboard} />
        </div>
      </section>

      <section>
        <h2 className="m-0 font-serif text-xl font-bold text-ink-900">My Wagers</h2>
        <div className="mt-3">
          <MyWagersList />
        </div>
      </section>
    </div>
  );
}
