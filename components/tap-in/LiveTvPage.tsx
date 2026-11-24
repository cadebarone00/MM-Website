"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LiveTvBoard } from "./LiveTvBoard";
import { PublicTripProfileSheet } from "@/components/platform/GolfTripMatch";
import { SavedTripSetupProvider } from "@/components/platform/SavedTripSetupProvider";
import { previewFromWatch, tvFromWatch } from "@/lib/platform/liveTvFromWatch";
import { tapInStats } from "@/lib/platform/tapInStats";
import type { TvBoardData, TvShow } from "@/lib/platform/liveTv";
import type { WatchView } from "@/lib/platform/watchView";
import styles from "./LiveTvBoard.module.css";

/** How often TV mode checks for new scores. */
const POLL_MS = 15_000;

/** Today in the viewer's own time zone ("YYYY-MM-DD"). */
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/**
 * The Maroon Live TV mode on a real event (/tap-in/<code>/tv, project_specs.md Step 4): the watcher's data from
 * /api/watch/<code> (private data already removed on the server), drawn by LiveTvBoard and refreshed on its own.
 * `show`: the organizer's pick (individual / match / both). A phone-width screen gets the narrow layout.
 * `interactive` (Desktop = TV, owner 2026-11-23: the event page on a computer): names open the golfer's trip profile,
 * the scroll pauses under the mouse, and "The Maroon Live" goes back to the directory. A TV just never uses them.
 * `sample` (the dev simulator): this watcher's view, or "missing"; nothing is loaded.
 */
export function LiveTvPage({ code, show, interactive = false, sample }: { code: string; show: TvShow; interactive?: boolean; sample?: WatchView | "missing" }) {
  const [view, setView] = useState<WatchView | null>(sample && sample !== "missing" ? sample : null);
  const [problem, setProblem] = useState<string | null>(sample === "missing" ? "This event isn't available." : null);
  const [narrow, setNarrow] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (sample) return;
    const reply = await fetch(`/api/watch/${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok: boolean; code?: string } & Partial<WatchView>>).catch(() => null);
    if (reply?.ok && reply.kind) { setView(reply as WatchView); setProblem(null); return; }
    // Keep the last scores on screen when a refresh fails; only say why when there's nothing to show.
    setProblem(reply === null ? "No connection. Scores will show when it's back." : reply.code === "missing" ? "This event isn't available." : "Couldn't load this event. Trying again…");
  }, [code, sample]);
  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const update = () => setNarrow(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  // The board, and (computers) the leaderboard behind it for the trip profile sheet.
  const board = useMemo<{ data: TvBoardData | null; error: boolean }>(() => {
    if (!view) return { data: null, error: false };
    try { return { data: tvFromWatch(view, localToday()), error: false }; }
    catch (error) { console.error("TV mode couldn't read this event:", error); return { data: null, error: true }; }
  }, [view]);
  const preview = useMemo(() => { try { return interactive && view ? previewFromWatch(view, localToday()) : null; } catch { return null; } }, [interactive, view]);
  const names = useMemo(() => new Set(preview?.leaderboard.map((e) => e.golfer.name) ?? []), [preview]);
  const surface = narrow ? "mobile" : "desktop";
  if (!board.data) return <div className={styles.screen} data-surface={surface}>
    <p className={styles.empty} role={problem || board.error ? "alert" : undefined}>{problem ?? (board.error ? "Couldn't show this event. Trying again…" : "Loading…")}</p>
  </div>;
  const sheet = preview && selected && <PublicTripProfileSheet match={preview} name={selected} tripStats={view?.kind === "trip" ? tapInStats(view.trip) : undefined} onClose={() => setSelected(null)} />;
  return <>
    <LiveTvBoard data={board.data} show={show} surface={surface} homeHref={interactive ? "/tap-in" : undefined}
      player={preview ? { has: (name) => names.has(name), open: setSelected } : undefined} />
    {/* A trip's profile sheet follows the trip's own settings (e.g. player stats on / off), like the live page. */}
    {sheet && view?.kind === "trip" ? <SavedTripSetupProvider tripId={view.trip.savedTrip.trip.id} snapshot={view.trip.setup} editable={false}>{sheet}</SavedTripSetupProvider> : sheet}
  </>;
}
