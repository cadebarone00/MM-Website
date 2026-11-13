"use client";

import { useEffect, useState } from "react";
import type { Market, TripSetup } from "./predictBets";
import { runPredict } from "./predictRun";

/**
 * Predict's odds for a trip, worked out ONCE and shared (the Predict tab and the leaderboard's win-odds line both read this).
 * The simulation runs on a background worker after the page has drawn, so nothing freezes. Returns null until the first
 * result; after that, the last result stays on screen while new scores are re-run (no flashing back to "loading").
 * Only re-runs when the trip data itself changes (compared as text), not every time the page re-renders.
 */
export function useTripMarkets(setup: TripSetup | null): Market[] | null {
  const key = setup ? JSON.stringify(setup) : null;
  const [result, setResult] = useState<{ key: string; markets: Market[] } | null>(null);
  useEffect(() => {
    if (!key) return;
    const parsed = JSON.parse(key) as TripSetup;
    let done = false;
    const finish = (markets: Market[]) => { if (!done) { done = true; setResult({ key, markets }); } };
    // Fallback (no worker support, or the worker fails): run it here, but after the page has drawn.
    const runHere = () => window.setTimeout(() => { try { finish(runPredict(parsed)); } catch { /* leave the last odds showing */ } }, 0);
    let worker: Worker | null = null;
    let timer: number | undefined;
    try {
      worker = new Worker(new URL("./predictMarkets.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ markets?: Market[]; error?: string }>) => {
        if (event.data.markets) finish(event.data.markets); else timer = runHere();
      };
      worker.onerror = () => { timer = runHere(); };
      worker.postMessage({ id: 1, setup: parsed });
    } catch {
      timer = runHere();
    }
    // A newer trip state (or leaving the page) cancels this run.
    return () => { done = true; worker?.terminate(); window.clearTimeout(timer); };
  }, [key]);
  return key && result ? result.markets : null;
}
