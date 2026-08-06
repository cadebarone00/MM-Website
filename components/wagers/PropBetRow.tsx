import { propMarket } from "@/lib/wagers/marketKeys";
import { OddsButton } from "./OddsButton";
import type { PropMarket } from "@/lib/wagers/types";

export function PropBetRow({ tournamentSlug, day, market: propMarketData }: { tournamentSlug: string; day: number; market: PropMarket }) {
  const market = propMarket(tournamentSlug, day, propMarketData);
  const [overSide, underSide] = market.selections;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-100 py-3 last:border-b-0">
      <div>
        <p className="m-0 font-sans text-sm font-semibold text-ink-900">{market.groupLabel.split(" — ")[0]}</p>
        <p className="m-0 font-sans text-2xs text-ink-400">
          {propMarketData.statLabel} — line {propMarketData.line}
        </p>
      </div>
      <div className="flex gap-2">
        <OddsButton marketKey={market.marketKey} selectionKey={overSide.key} label={overSide.label} odds={overSide.odds} />
        <OddsButton marketKey={market.marketKey} selectionKey={underSide.key} label={underSide.label} odds={underSide.odds} />
      </div>
    </div>
  );
}
