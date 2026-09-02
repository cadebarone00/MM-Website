import { OddsButton } from "./OddsButton";
import type { Market, PlayerFutureDefinition } from "@/lib/wagers/marketKeys";

/** Standard layout for every player future: title and line left, Yes/No odds right. */
export function PlayerFutureCard({ future, market }: { future: PlayerFutureDefinition; market: Market }) {
  const [yes, no] = market.selections;

  return (
    <div className="rounded-sm border border-gold-300 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="m-0 font-sans text-sm font-semibold text-ink-900">{future.title}</p>
          <p className="mt-1 font-condensed text-sm font-bold text-ink-500">{future.detail}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <OddsButton marketKey={market.marketKey} selectionKey={yes.key} label={yes.label} odds={yes.odds} tone="yes" prefix="Yes" />
          <OddsButton marketKey={market.marketKey} selectionKey={no.key} label={no.label} odds={no.odds} tone="no" prefix="No" />
        </div>
      </div>
    </div>
  );
}
