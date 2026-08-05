import { getPlayerDisplayName } from "@/lib/data/players";
import { matchWinnerOdds } from "@/lib/wagers/mockOdds";
import { OddsButton } from "./OddsButton";
import type { RealMatch } from "@/lib/data/types";

function sideLabel(players: string[]): string {
  return players.map((p) => getPlayerDisplayName(p).split(" ").pop()).join(" & ");
}

export function MatchWinnerCard({ match }: { match: RealMatch }) {
  const odds = matchWinnerOdds(match);
  const maroonLabel = sideLabel(match.maroonPlayers);
  const whiteLabel = sideLabel(match.whitePlayers);

  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Match Winner</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="flex flex-col items-start gap-2">
          <span className="font-sans text-sm font-semibold text-maroon-700">{maroonLabel}</span>
          <OddsButton label={`${maroonLabel} wins the match`} odds={odds.maroon} />
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <span className="font-sans text-sm font-semibold text-ink-900">{whiteLabel}</span>
          <OddsButton label={`${whiteLabel} wins the match`} odds={odds.white} />
        </div>
      </div>
    </div>
  );
}
