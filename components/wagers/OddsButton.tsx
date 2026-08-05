"use client";

import { useState } from "react";
import { formatAmericanOdds } from "@/lib/wagers/americanOdds";
import { BetSlipSheet } from "./BetSlipSheet";

/** A single tappable odds pill — a Match Winner side, a prop's Over/Under, or a futures-ladder row. Opens the shared bet slip for this one selection. */
export function OddsButton({ label, odds }: { label: string; odds: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          "min-w-[64px] rounded-sm border px-3 py-2 text-center font-condensed text-sm font-bold tabular-nums transition-colors",
          odds > 0
            ? "border-fairway-300 text-fairway-700 hover:bg-[#E2EDE7]"
            : "border-maroon-200 text-score-under hover:bg-maroon-50",
        ].join(" ")}
      >
        {formatAmericanOdds(odds)}
      </button>
      {open && <BetSlipSheet label={label} odds={odds} open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
