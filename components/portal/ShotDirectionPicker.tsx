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
      className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${selected ? "border-maroon-700 bg-maroon-700 text-white" : "border-ink-200 bg-white text-ink-500 hover:border-maroon-300"} disabled:opacity-50`}
    >
      <Icon size={16} />
    </button>
  );
}

/**
 * Fairway/GIR compass: center check = hit, the 4 arrows = which way it
 * missed. Used by both the live-scoring card and the Submit-a-score card.
 */
export function ShotDirectionPicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: ShotResult | null;
  onChange: (result: ShotResult) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="text-center font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <div className="mx-auto mt-2 grid w-fit grid-cols-3 grid-rows-3 items-center justify-items-center gap-1.5">
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
    </div>
  );
}
