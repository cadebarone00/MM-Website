import { Trophy } from "lucide-react";
import { teamWinnerOdds } from "@/lib/wagers/mockOdds";
import { OddsButton } from "./OddsButton";
import { WagerBox } from "./WagerBox";
import type { Tournament } from "@/lib/data/types";

export function TeamFuturesCard({ tournament }: { tournament: Tournament }) {
  const odds = teamWinnerOdds(tournament);

  return (
    <WagerBox icon={<Trophy size={16} />} title="Team Winner">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-start gap-2">
          <span className="font-sans text-sm font-semibold text-maroon-700">Maroon</span>
          <OddsButton label="Maroon wins the tournament" odds={odds.maroon} />
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <span className="font-sans text-sm font-semibold text-ink-900">White</span>
          <OddsButton label="White wins the tournament" odds={odds.white} />
        </div>
      </div>
    </WagerBox>
  );
}
