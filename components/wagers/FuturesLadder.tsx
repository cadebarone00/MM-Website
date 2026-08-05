import { getPlayerDisplayName } from "@/lib/data/players";
import { tournamentWinnerLadder } from "@/lib/wagers/mockOdds";
import { OddsButton } from "./OddsButton";
import type { IndividualStanding } from "@/lib/data/types";

export function FuturesLadder({ standings }: { standings: IndividualStanding[] }) {
  const ladder = tournamentWinnerLadder(standings);

  if (ladder.length === 0) {
    return <p className="font-sans text-sm text-ink-400">Tournament Winner odds post once the individual leaderboard has entries.</p>;
  }

  return (
    <div className="rounded-md border border-ink-100 bg-white">
      {ladder.map((entry, i) => {
        const name = getPlayerDisplayName(entry.player);
        return (
          <div
            key={entry.player}
            className={["flex items-center justify-between gap-3 px-4 py-3", i > 0 ? "border-t border-ink-100" : ""].join(" ")}
          >
            <span className="font-sans text-sm font-semibold text-ink-900">{name}</span>
            <OddsButton label={`${name} wins the tournament`} odds={entry.odds} />
          </div>
        );
      })}
    </div>
  );
}
