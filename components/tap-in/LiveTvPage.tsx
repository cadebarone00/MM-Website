"use client";

import { useCallback, useEffect, useState } from "react";
import { LiveTvBoard } from "./LiveTvBoard";
import { tvFromWatch } from "@/lib/platform/liveTvFromWatch";
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
 */
export function LiveTvPage({ code, show }: { code: string; show: TvShow }) {
  const [data, setData] = useState<TvBoardData | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const load = useCallback(async () => {
    const reply = await fetch(`/api/watch/${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok: boolean; code?: string } & Partial<WatchView>>).catch(() => null);
    if (reply?.ok && reply.kind) {
      try { setData(tvFromWatch(reply as WatchView, localToday())); setProblem(null); }
      catch (error) { console.error("TV mode couldn't read this event:", error); setProblem("Couldn't show this event. Trying again…"); }
      return;
    }
    // Keep the last scores on screen when a refresh fails; only say why when there's nothing to show.
    setProblem(reply === null ? "No connection. Scores will show when it's back." : reply.code === "missing" ? "This event isn't available." : "Couldn't load this event. Trying again…");
  }, [code]);
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
  if (!data) return <div className={styles.screen} data-surface={narrow ? "mobile" : "desktop"}><p className={styles.empty} role={problem ? "alert" : undefined}>{problem ?? "Loading…"}</p></div>;
  return <LiveTvBoard data={data} show={show} surface={narrow ? "mobile" : "desktop"} />;
}
