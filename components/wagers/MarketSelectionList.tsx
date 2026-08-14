"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { formatAmericanOdds } from "@/lib/wagers/americanOdds";
import { WagerStakeForm } from "./WagerStakeForm";

export interface MarketSelection {
  /** The specific market this selection belongs to — e.g. one prop's marketKey (each prop is its own market). */
  marketKey: string;
  key: string;
  label: string;
  odds: number;
}

/**
 * A Wagers market page's body: pick a selection (2 sides for Team/Match
 * Winner, many for a futures ladder or a match's props), then stake.
 * Search is optional — pass `searchPlaceholder` only when a list is long
 * enough to need it (a futures ladder, a match's props).
 */
export function MarketSelectionList({
  selections,
  searchPlaceholder,
}: {
  selections: MarketSelection[];
  searchPlaceholder?: string;
}) {
  const [chosen, setChosen] = useState<MarketSelection | null>(null);
  const [search, setSearch] = useState("");

  if (chosen) {
    return (
      <WagerStakeForm
        marketKey={chosen.marketKey}
        selectionKey={chosen.key}
        label={chosen.label}
        odds={chosen.odds}
        onChangeSelection={() => setChosen(null)}
      />
    );
  }

  const term = search.trim().toLowerCase();
  const visible = term === "" ? selections : selections.filter((s) => s.label.toLowerCase().includes(term));

  return (
    <div className="flex flex-col gap-4">
      {searchPlaceholder && (
        <Input
          iconLeft={<Search size={16} />}
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {visible.length === 0 ? (
        <p className="font-sans text-sm text-ink-400">No selections match &ldquo;{search}&rdquo;.</p>
      ) : (
        <div className="flex flex-col divide-y divide-ink-100">
          {visible.map((selection) => (
            <button
              key={selection.key}
              type="button"
              onClick={() => setChosen(selection)}
              className="flex items-center justify-between gap-3 py-3 text-left first:pt-0"
            >
              <span className="font-sans text-sm font-semibold text-ink-900">{selection.label}</span>
              <span className="font-condensed text-sm font-bold tabular-nums text-maroon-700">{formatAmericanOdds(selection.odds)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
