import Link from "next/link";
import { OddsButton } from "./OddsButton";

type Selection = { key: string; label: string; odds: number };

function playerName(label: string) {
  return label.replace(" wins the tournament", "");
}

/** A futures market preview; odds open the wager slip while the card itself can link to the full market. */
export function FuturesMarketCard({
  title,
  marketKey,
  selections,
  href,
  limit,
}: {
  title: string;
  marketKey: string;
  selections: Selection[];
  href?: string;
  limit?: number;
}) {
  const visibleSelections = limit ? selections.slice(0, limit) : selections;

  return (
    <div className="relative overflow-hidden rounded-sm border border-gold-400 bg-white">
      {href && <Link href={href} aria-label={`View all ${title} odds`} className="absolute inset-0 z-0" />}
      <div className="relative z-10 p-4 pointer-events-none">
        <p className="m-0 font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-400">{title}</p>
        <div className="mt-3 divide-y divide-gold-200">
          {visibleSelections.map((selection) => (
            <div key={selection.key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <span className="min-w-0 truncate font-sans text-sm font-semibold text-ink-900">{playerName(selection.label)}</span>
              <div className="pointer-events-auto shrink-0">
                <OddsButton marketKey={marketKey} selectionKey={selection.key} label={selection.label} odds={selection.odds} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
