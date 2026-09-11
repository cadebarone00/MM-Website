"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";

/**
 * Bottom bar on the hole-scoring card: a GPS button (decorative for now —
 * no course has distance data yet) and a primary "next" action.
 */
export function HoleActionBar({
  nextLabel,
  onNext,
  disabled,
}: {
  nextLabel: string;
  onNext: () => void;
  disabled?: boolean;
}) {
  const [showGpsNotice, setShowGpsNotice] = useState(false);

  return (
    <div className="mt-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowGpsNotice(true)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-3 font-condensed text-xs font-bold uppercase tracking-wide text-white"
        >
          <MapPin size={14} /> GPS
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={disabled}
          className="flex-1 rounded-lg bg-maroon-700 px-4 py-3 font-condensed text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {nextLabel}
        </button>
      </div>
      {showGpsNotice && <p className="mt-2 font-sans text-xs text-ink-500">GPS distance is coming in a later round.</p>}
    </div>
  );
}
