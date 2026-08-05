import { User } from "lucide-react";
import { getPlayerDisplayName } from "@/lib/data/players";
import { tournamentWinnerLadder } from "@/lib/wagers/mockOdds";
import { OddsButton } from "./OddsButton";
import { WagerBox } from "./WagerBox";
import type { IndividualStanding } from "@/lib/data/types";

export function FuturesLadder({ standings, search = "" }: { standings: IndividualStanding[]; search?: string }) {
  if (standings.length === 0) {
    return <p className="font-sans text-sm text-ink-400">Tournament Winner odds post once the individual leaderboard has entries.</p>;
  }

  const term = search.trim().toLowerCase();
  const ladder = tournamentWinnerLadder(standings).filter((entry) =>
    getPlayerDisplayName(entry.player).toLowerCase().includes(term)
  );

  if (ladder.length === 0) {
    return <p className="font-sans text-sm text-ink-400">No players match &ldquo;{search}&rdquo;.</p>;
  }

  return (
    <WagerBox icon={<User size={16} />} title="Tournament Winner">
      <div className="flex flex-col divide-y divide-ink-100">
        {ladder.map((entry) => {
          const name = getPlayerDisplayName(entry.player);
          return (
            <div key={entry.player} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <span className="font-sans text-sm font-semibold text-ink-900">{name}</span>
              <OddsButton label={`${name} wins the tournament`} odds={entry.odds} />
            </div>
          );
        })}
      </div>
    </WagerBox>
  );
}
