"use client";

import { useState, useSyncExternalStore } from "react";
import { LiveTvPage } from "./LiveTvPage";
import { WatchPage } from "@/components/platform/WatchPage";
import type { WatchView } from "@/lib/platform/watchView";
import styles from "./LiveEventPage.module.css";

/** Phone width: the same cutoff TV mode uses for its narrow layout. */
const PHONE = "(max-width: 700px)";
const subscribe = (change: () => void) => { const query = window.matchMedia(PHONE); query.addEventListener("change", change); return () => query.removeEventListener("change", change); };

export type LiveMode = "board" | "tv";

/**
 * An event's page (/tap-in/<code>), Board / TV mode pills (owner 2026-11-23, approved):
 * - Board (always first): today's live page (Leaderboard, Matches, Stats, scorecards), to tap or click around.
 * - TV mode: the scrolling TV board. A wide screen gets the full board (names open trip profiles, a Stats slide-out);
 *   a phone gets a 16×9 TV screen with Full screen and the stats insights under it.
 * `sample` / `wide` / `start` (the dev simulator): made-up data, the simulator's View, and its Conditionals.
 */
export function LiveEventPage({ code, sample, wide, start }: { code: string; sample?: WatchView | "missing"; wide?: boolean;
  start?: { mode?: LiveMode; statsOpen?: boolean; full?: boolean } }) {
  const [mode, setMode] = useState<LiveMode>(start?.mode ?? "board");
  const phone = useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => null);
  const isWide = wide ?? (phone === null ? null : !phone);
  if (isWide === null) return null;
  const pills = <ModePills mode={mode} onMode={setMode} />;
  if (mode === "board") return <WatchPage code={code} sample={sample} toolbar={<div className={styles.pillBar}>{pills}</div>} />;
  return isWide ? <LiveTvPage code={code} show="both" interactive sample={sample} controls={pills} withStats start={start} />
    : <LiveTvPage code={code} show="both" sample={sample} layout="phone" controls={<div className={styles.pillBar}>{pills}</div>} withStats start={start} />;
}

/** Board | TV mode. */
function ModePills({ mode, onMode }: { mode: LiveMode; onMode: (mode: LiveMode) => void }) {
  return <div className={styles.pills} role="group" aria-label="View">
    {([["board", "Board"], ["tv", "TV mode"]] as const).map(([id, label]) =>
      <button key={id} type="button" className={styles.pill} aria-pressed={mode === id} onClick={() => onMode(id)}>{label}</button>)}
  </div>;
}
