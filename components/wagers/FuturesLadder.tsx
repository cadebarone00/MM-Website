import { getPlayerDisplayName } from "@/lib/data/players";
import { futurePlayerMarket } from "@/lib/wagers/marketKeys";
import { OddsButton } from "./OddsButton";
import type { IndividualStanding } from "@/lib/data/types";

export function FuturesLadder({ tournamentSlug, standings }: { tournamentSlug: string; standings: IndividualStanding[] }) {
  const market = futurePlayerMarket(tournamentSlug, standings);

  if (market.selections.length === 0) {
    return <p className="font-sans text-sm text-ink-400">Tournament Winner odds post once the individual leaderboard has entries.</p>;
  }

  return (
    <div className="rounded-md border border-ink-100 bg-white">
      {market.selections.map((selection, i) => {
        const name = getPlayerDisplayName(selection.key);
        return (
          <div
            key={selection.key}
            className={["flex items-center justify-between gap-3 px-4 py-3", i > 0 ? "border-t border-ink-100" : ""].join(" ")}
          >
            <span className="font-sans text-sm font-semibold text-ink-900">{name}</span>
            <OddsButton marketKey={market.marketKey} selectionKey={selection.key} label={selection.label} odds={selection.odds} />
          </div>
        );
      })}
    </div>
  );
}
