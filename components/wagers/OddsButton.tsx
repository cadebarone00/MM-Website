"use client";

import { useState } from "react";
import { formatAmericanOdds } from "@/lib/wagers/americanOdds";
import { BetSlipSheet } from "./BetSlipSheet";

/** A single tappable odds pill — a Match Winner side, a prop's Over/Under, or a futures-ladder row. Opens the shared bet slip for this one selection. */
export function OddsButton({
  marketKey,
  selectionKey,
  label,
  odds,
  tone = "default",
  prefix,
}: {
  marketKey: string;
  selectionKey: string;
  label: string;
  odds: number;
  tone?: "default" | "yes" | "no";
  prefix?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          "min-w-[64px] rounded-sm border px-3 py-2 text-center font-condensed text-sm font-bold tabular-nums transition-colors",
          tone === "yes"
            ? "border-fairway-600 bg-fairway-600 text-white hover:bg-fairway-700"
            : tone === "no"
              ? "border-red-700 bg-red-700 text-white hover:bg-red-800"
              : odds > 0
            ? "border-fairway-300 text-fairway-700 hover:bg-[#E2EDE7]"
            : "border-maroon-200 text-score-under hover:bg-maroon-50",
        ].join(" ")}
      >
        {prefix ? `${prefix} ${formatAmericanOdds(odds)}` : formatAmericanOdds(odds)}
      </button>
      {open && (
        <BetSlipSheet
          marketKey={marketKey}
          selectionKey={selectionKey}
          label={label}
          odds={odds}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
