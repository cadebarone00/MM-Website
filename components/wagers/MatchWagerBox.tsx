import { Flag } from "lucide-react";
import { getPlayerDisplayName } from "@/lib/data/players";
import { matchWinnerOdds } from "@/lib/wagers/mockOdds";
import { OddsButton } from "./OddsButton";
import { WagerBox } from "./WagerBox";
import type { RealMatch } from "@/lib/data/types";

function sideLabel(players: string[]): string {
  return players.map((p) => getPlayerDisplayName(p).split(" ").pop()).join(" & ");
}

/**
 * The Matches category page's per-match box — same odds as
 * MatchWinnerCard (used on the unrelated Match Breakdown page) but in the
 * Wagers section's WagerBox shell. Kept as its own component rather than
 * reusing MatchWinnerCard so restyling Wagers never touches Match
 * Breakdown's look.
 */
export function MatchWagerBox({ match }: { match: RealMatch }) {
  const odds = matchWinnerOdds(match);
  const maroonLabel = sideLabel(match.maroonPlayers);
  const whiteLabel = sideLabel(match.whitePlayers);

  return (
    <WagerBox icon={<Flag size={16} />} title={`${maroonLabel} vs ${whiteLabel}`}>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-start gap-2">
          <span className="font-sans text-sm font-semibold text-maroon-700">{maroonLabel}</span>
          <OddsButton label={`${maroonLabel} wins the match`} odds={odds.maroon} />
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <span className="font-sans text-sm font-semibold text-ink-900">{whiteLabel}</span>
          <OddsButton label={`${whiteLabel} wins the match`} odds={odds.white} />
        </div>
      </div>
    </WagerBox>
  );
}
