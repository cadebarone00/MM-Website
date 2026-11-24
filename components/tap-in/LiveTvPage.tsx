"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";
import { GolfTripStats } from "@/components/platform/GolfTripStats";
import { LiveTvBoard } from "./LiveTvBoard";
import { PublicTripProfileSheet } from "@/components/platform/GolfTripMatch";
import { SavedTripSetupProvider } from "@/components/platform/SavedTripSetupProvider";
import { previewFromWatch, tvFromWatch } from "@/lib/platform/liveTvFromWatch";
import { tapInStats } from "@/lib/platform/tapInStats";
import type { TvBoardData, TvShow } from "@/lib/platform/liveTv";
import type { WatchView } from "@/lib/platform/watchView";
import styles from "./LiveTvBoard.module.css";
import page from "./LiveEventPage.module.css";

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
 * Board / TV mode pills (owner 2026-11-23): `controls` = the pills; `withStats` = the trip's stats insights (a slide-out
 * on a big screen); `layout: "phone"` = the phone's TV mode, a 16×9 TV screen with Full screen, the stats under it.
 * `start` (the dev simulator's Conditionals): stats panel open / already full screen.
 */
export function LiveTvPage({ code, show, interactive = false, sample, layout = "screen", controls, withStats = false, start }: { code: string; show: TvShow; interactive?: boolean;
  sample?: WatchView | "missing"; layout?: "screen" | "phone"; controls?: ReactNode; withStats?: boolean; start?: { statsOpen?: boolean; full?: boolean } }) {
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
  // Stats insights: trips only for now (tournaments and leagues have no stats yet), so nothing for them.
  const stats = withStats && view?.kind === "trip" ? <GolfTripStats stats={tapInStats(view.trip)} /> : null;
  if (layout === "phone") return <PhoneTv data={board.data} problem={problem ?? (board.error ? "Couldn't show this event. Trying again…" : null)} show={show} controls={controls} stats={stats} startFull={start?.full} />;
  if (!board.data) return <div className={styles.screen} data-surface={surface}>
    <p className={styles.empty} role={problem || board.error ? "alert" : undefined}>{problem ?? (board.error ? "Couldn't show this event. Trying again…" : "Loading…")}</p>
  </div>;
  const sheet = preview && selected && <PublicTripProfileSheet match={preview} name={selected} tripStats={view?.kind === "trip" ? tapInStats(view.trip) : undefined} onClose={() => setSelected(null)} />;
  return <>
    <LiveTvBoard data={board.data} show={show} surface={surface} homeHref={interactive ? "/tap-in" : undefined}
      player={preview ? { has: (name) => names.has(name), open: setSelected } : undefined} controls={controls} stats={stats ?? undefined} statsStartOpen={start?.statsOpen} />
    {/* A trip's profile sheet follows the trip's own settings (e.g. player stats on / off), like the live page. */}
    {sheet && view?.kind === "trip" ? <SavedTripSetupProvider tripId={view.trip.savedTrip.trip.id} snapshot={view.trip.setup} editable={false}>{sheet}</SavedTripSetupProvider> : sheet}
  </>;
}

type FullscreenOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

/**
 * TV mode on a phone (owner 2026-11-23): the pills, then a 16×9 TV screen playing the real TV board (shrunk), with Full
 * screen, then the stats insights. Full screen goes truly full screen and sideways where the phone allows it (Android, the
 * Android app); an iPhone's browser doesn't let websites do that, so the TV screen covers the whole page instead and fills
 * it once the phone is turned sideways (screen mirroring then sends a proper wide picture).
 */
function PhoneTv({ data, problem, show, controls, stats, startFull = false }: { data: TvBoardData | null; problem: string | null; show: TvShow; controls?: ReactNode; stats: ReactNode; startFull?: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const [cover, setCover] = useState(startFull);
  const [native, setNative] = useState(false);
  useEffect(() => {
    const update = () => setNative(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const full = cover || native;
  useEffect(() => {
    if (!cover) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setCover(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [cover]);
  const enter = async () => {
    const element = stage.current;
    if (element?.requestFullscreen && document.fullscreenEnabled) {
      try {
        await element.requestFullscreen();
        await (screen.orientation as FullscreenOrientation | undefined)?.lock?.("landscape").catch(() => undefined);
        return;
      } catch { /* not allowed here: cover the page instead */ }
    }
    setCover(true);
  };
  const exit = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setCover(false);
  };
  return <div className={page.phonePage}>
    {controls}
    <div ref={stage} className={page.stage} data-cover={cover ? "" : undefined}>
      <div className={page.frame}>
        {data ? <LiveTvBoard data={data} show={show} framed />
          : <div className={styles.screen} data-framed=""><p className={styles.empty} role={problem ? "alert" : undefined}>{problem ?? "Loading…"}</p></div>}
      </div>
      {full ? <button type="button" className={page.exitFull} onClick={exit} aria-label="Exit full screen"><X size={20} aria-hidden /></button>
        : <button type="button" className={page.fullButton} onClick={() => void enter()}><Maximize2 size={14} aria-hidden /> Full screen</button>}
      {cover && <p className={page.turnHint}>Turn your phone sideways to fill the screen.</p>}
    </div>
    {stats && <section className={page.phoneStats} aria-label="Stats insights"><h2>Stats insights</h2>{stats}</section>}
  </div>;
}
