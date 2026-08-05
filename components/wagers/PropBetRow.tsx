import { getPlayerDisplayName } from "@/lib/data/players";
import { OddsButton } from "./OddsButton";
import type { PropMarket } from "@/lib/wagers/types";

export function PropBetRow({ market }: { market: PropMarket }) {
  const name = getPlayerDisplayName(market.player).split(" ").pop();

  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-100 py-3 last:border-b-0">
      <div>
        <p className="m-0 font-sans text-sm font-semibold text-ink-900">{name}</p>
        <p className="m-0 font-sans text-2xs text-ink-400">
          {market.statLabel} — line {market.line}
        </p>
      </div>
      <div className="flex gap-2">
        <OddsButton label={`${name} over ${market.line} ${market.statLabel.toLowerCase()}`} odds={market.overOdds} />
        <OddsButton label={`${name} under ${market.line} ${market.statLabel.toLowerCase()}`} odds={market.underOdds} />
      </div>
    </div>
  );
}
