"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { RoundInProgress } from "@/lib/handicap/roundInProgress";
import { formatToPar } from "@/lib/handicap/format";
import { useRoundInProgress } from "@/lib/handicap/useRoundInProgress";

const BUTTON_CLASS = "rounded-lg border border-white/30 bg-maroon-700 px-4 py-2.5 font-condensed text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-maroon-800 sm:text-sm";

/** Shown instead of a second round: pick up the one in progress, or throw it away and start over. Continue is the default focus so the destructive choice is never one stray tap away. */
function RoundInProgressDialog({ round, onClose, onStartNew }: { round: RoundInProgress; onClose: () => void; onStartNew: () => void }) {
  const continueRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => { continueRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Portaled to the page root so no ancestor's stacking context can put the site header on top of it.
  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-[400] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="round-in-progress-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-md bg-white p-5 text-ink-900 shadow-xl">
        <h2 id="round-in-progress-title" className="font-serif text-xl font-bold">Already have a round in progress</h2>
        <div className="mt-3 rounded-sm bg-cream-50 px-3 py-2">
          <p className="font-sans text-sm font-semibold text-ink-900">{round.courseName}</p>
          <p className="font-sans text-sm text-ink-600">To par: <span aria-label="To par" className="font-bold text-maroon-700">{formatToPar(round.toPar)}</span></p>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Link ref={continueRef} href="/portal/handicap/new" className="w-full rounded-pill bg-maroon-700 px-4 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-white">Continue round</Link>
          <Link href="/portal/handicap/new" onClick={onStartNew} className="w-full rounded-pill border border-maroon-700 px-4 py-3 text-center font-condensed text-sm font-semibold uppercase tracking-wide text-maroon-700">Start a new round</Link>
          <p className="text-center font-sans text-xs text-ink-500">Starting a new round deletes the round in progress.</p>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * My Handicap's "Submit a score" button. With no round in progress it's a
 * plain link to the course selector; with one, it asks whether to continue
 * that round or delete it and start a new one.
 */
export function SubmitScoreButton({ playerSlug }: { playerSlug: string }) {
  const { round, deleteRound } = useRoundInProgress(playerSlug);
  const [open, setOpen] = useState(false);

  if (!round) return <Link href="/portal/handicap/new" className={BUTTON_CLASS}>Submit a score</Link>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={BUTTON_CLASS}>Submit a score</button>
      {open && <RoundInProgressDialog round={round} onClose={() => setOpen(false)} onStartNew={() => { deleteRound(); setOpen(false); }} />}
    </>
  );
}
