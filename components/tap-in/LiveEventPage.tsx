"use client";

import { useSyncExternalStore } from "react";
import { LiveTvPage } from "./LiveTvPage";
import { WatchPage } from "@/components/platform/WatchPage";
import type { WatchView } from "@/lib/platform/watchView";

/** Phone width: the same cutoff TV mode uses for its narrow layout. */
const PHONE = "(max-width: 700px)";
const subscribe = (change: () => void) => { const query = window.matchMedia(PHONE); query.addEventListener("change", change); return () => query.removeEventListener("change", change); };

/**
 * An event's Leaderboard page (/tap-in/<code>). Desktop = TV (owner 2026-11-23, approved): a wide screen (computer, TV
 * browser, Xbox, laptop on HDMI, a cast tab) gets the exact TV board, with names that open trip profiles. Phones keep
 * today's live page (Leaderboard, Matches, Stats, scorecards). Nothing shows until the width is known (one frame), so
 * neither page flashes first. `sample`/`wide` (the dev simulator): made-up data and the simulator's View.
 */
export function LiveEventPage({ code, sample, wide }: { code: string; sample?: WatchView | "missing"; wide?: boolean }) {
  const phone = useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => null);
  const isWide = wide ?? (phone === null ? null : !phone);
  if (isWide === null) return null;
  return isWide ? <LiveTvPage code={code} show="both" interactive sample={sample} /> : <WatchPage code={code} sample={sample} />;
}
