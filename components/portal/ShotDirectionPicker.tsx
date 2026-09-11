"use client";

import { Check, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, type LucideIcon } from "lucide-react";
import type { ShotDirection } from "@/lib/handicap/types";

/** "hit" (the center check) plus the 4 miss directions (the compass arrows). */
export type ShotResult = "hit" | ShotDirection;

function DirectionButton({ selected, onClick, disabled, label, icon: Icon }: { selected: boolean; onClick: () => void; disabled?: boolean; label: string; icon: LucideIcon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={selected}
      className={`flex aspect-square w-full max-w-12 items-center justify-center rounded-full border-2 transition-colors ${selected ? "border-maroon-700 bg-maroon-700 text-white" : "border-ink-200 bg-white text-ink-500 hover:border-maroon-300"} disabled:opacity-50`}
    >
      <Icon size={22} />
    </button>
  );
}

/**
 * Fairway/GIR compass: center check = hit, the 4 arrows = which way it
 * missed. Used by both the live-scoring card and the Submit-a-score card.
 * GIR only: a "Penalty" toggle below the short-miss arrow, for a missed green that
 * wasn't a directional miss — a penalty stroke or lost ball. The grid is a
 * fixed width so all 3 columns stay equal regardless of what's above them.
 */
export function ShotDirectionPicker({
  label,
  value,
  onChange,
  disabled,
  penaltyOption,
}: {
  label: string;
  value: ShotResult | null;
  onChange: (result: ShotResult) => void;
  disabled?: boolean;
  penaltyOption?: boolean;
}) {
  return (
    <div className="w-full max-w-44">
      <div className="flex items-center justify-center gap-2">
        <p className="font-condensed text-sm font-semibold uppercase tracking-wide text-ink-500">{label}</p>

      </div>
      <div className="mx-auto mt-3 grid w-full max-w-44 grid-cols-3 grid-rows-3 items-center justify-items-center gap-2">
        <div />
        <DirectionButton label={`${label} missed long`} icon={ArrowUp} selected={value === "long"} onClick={() => onChange("long")} disabled={disabled} />
        <div />
        <DirectionButton label={`${label} missed left`} icon={ArrowLeft} selected={value === "left"} onClick={() => onChange("left")} disabled={disabled} />
        <DirectionButton label={`${label} hit`} icon={Check} selected={value === "hit"} onClick={() => onChange("hit")} disabled={disabled} />
        <DirectionButton label={`${label} missed right`} icon={ArrowRight} selected={value === "right"} onClick={() => onChange("right")} disabled={disabled} />
        <div />
        <DirectionButton label={`${label} missed short`} icon={ArrowDown} selected={value === "short"} onClick={() => onChange("short")} disabled={disabled} />
        <div />
      </div>
      <div className="mt-2 flex min-h-8 justify-center">
        {penaltyOption && (
          <button
            type="button"
            onClick={() => onChange("penalty")}
            disabled={disabled}
            aria-pressed={value === "penalty"}
            className={`whitespace-nowrap rounded-full border px-2.5 py-1 font-condensed text-2xs font-bold uppercase tracking-wide transition-colors ${value === "penalty" ? "border-maroon-700 bg-maroon-700 text-white" : "border-ink-200 bg-white text-ink-500 hover:border-maroon-300"} disabled:opacity-50`}
          >
            Penalty
          </button>
        )}
      </div>
    </div>
  );
}
