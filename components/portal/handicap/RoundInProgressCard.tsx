"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { deleteRoundInProgress, parseRoundInProgress, readRoundInProgressRaw } from "@/lib/handicap/roundInProgress";
import { formatRoundDate, formatToPar } from "@/lib/handicap/format";

const CHANGED = "mm-handicap-round-changed";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGED, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGED, callback);
  };
}

/**
 * The handicap round you started but haven't submitted, shown like a
 * completed round (to-par where the score goes, no differential yet).
 * Tap it to Continue playing (back into the round, on the hole you left)
 * or Delete it. Reads this device's saved round — see roundInProgress.ts.
 */
export function RoundInProgressCard({ playerSlug }: { playerSlug: string }) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => { try { return JSON.stringify(readRoundInProgressRaw(localStorage, playerSlug)); } catch { return ""; } },
    () => ""
  );
  const round = useMemo(() => (snapshot ? parseRoundInProgress(JSON.parse(snapshot)) : null), [snapshot]);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!round) return null;

  function handleDelete() {
    try { deleteRoundInProgress(localStorage, playerSlug); } catch { /* Nothing more we can do if storage is blocked. */ }
    setOpen(false);
    setConfirming(false);
    window.dispatchEvent(new Event(CHANGED));
  }

  return (
    <section aria-label="Round in progress" className="mx-auto mt-6 max-w-4xl px-4 sm:px-6">
      <h2 className="border-b border-stone-200 pb-3 font-condensed text-sm font-bold text-maroon-700">Round in progress</h2>
      <div className="border-b border-stone-200 bg-white">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => { setOpen((current) => !current); setConfirming(false); }}
          className="grid w-full grid-cols-[42px_50px_minmax(0,1fr)_70px] items-center gap-1.5 py-3 pr-2 text-left sm:grid-cols-[60px_64px_minmax(0,1fr)_90px]"
        >
          <span aria-label="To par" className="block border-r border-stone-200 px-1 text-center font-sans text-2xl font-medium tabular-nums text-maroon-700">{formatToPar(round.toPar)}</span>
          <span aria-hidden className="block" />
          <span className="block min-w-0 pl-1">
            <span className="block truncate font-sans text-xs text-ink-600">{formatRoundDate(round.datePlayed)}</span>
            <span title={round.courseName} className="mt-1 block truncate font-sans text-sm font-semibold text-ink-900">{round.courseName}</span>
            <span className="mt-0.5 block truncate font-sans text-xs text-ink-500">{round.teeName}</span>
          </span>
          <span aria-label="Course rating and slope" className="block border-l border-stone-200 pl-2 text-right font-sans text-xs tabular-nums text-maroon-700">{round.rating}/{round.slope}</span>
        </button>
        {open && (
          <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 px-3 py-3">
            <Link href="/portal/handicap/new" className="rounded-pill bg-maroon-700 px-4 py-2.5 font-condensed text-xs font-bold uppercase tracking-wide text-white">Continue playing</Link>
            {confirming ? (
              <>
                <span className="font-sans text-sm text-ink-700">Delete this round? This can&apos;t be undone.</span>
                <button type="button" onClick={handleDelete} className="rounded-pill bg-red-700 px-4 py-2.5 font-condensed text-xs font-bold uppercase tracking-wide text-white">Delete</button>
                <button type="button" onClick={() => setConfirming(false)} className="font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700 underline">Cancel</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="rounded-pill border border-maroon-700 px-4 py-2.5 font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700">Delete round</button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
