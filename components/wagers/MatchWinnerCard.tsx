import { matchWinnerMarket } from "@/lib/wagers/marketKeys";
import { OddsButton } from "./OddsButton";
import type { RealMatch } from "@/lib/data/types";

export function MatchWinnerCard({ tournamentSlug, match }: { tournamentSlug: string; match: RealMatch }) {
  const market = matchWinnerMarket(tournamentSlug, match);
  const [maroonSide, whiteSide] = market.selections;

  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">Match Winner</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="flex flex-col items-start gap-2">
          <span className="font-sans text-sm font-semibold text-maroon-700">{maroonSide.label.replace(" wins the match", "")}</span>
          <OddsButton marketKey={market.marketKey} selectionKey={maroonSide.key} label={maroonSide.label} odds={maroonSide.odds} />
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <span className="font-sans text-sm font-semibold text-ink-900">{whiteSide.label.replace(" wins the match", "")}</span>
          <OddsButton marketKey={market.marketKey} selectionKey={whiteSide.key} label={whiteSide.label} odds={whiteSide.odds} />
        </div>
      </div>
    </div>
  );
}
