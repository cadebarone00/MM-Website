"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { BroadcastPlayerVideo } from "@/lib/broadcast/types";

const MIN_TRANSITION_MS = 3000;
const EXIT_MS = 800;

/**
 * The transition is also the player-video loading cover. It never releases
 * until the clip can play and the three-second on-air animation has had time
 * to land, preventing viewers from ever seeing a browser buffer spinner.
 */
export function PlayerVideoTransitionScene({ video, startedAt, preview = false }: { video: BroadcastPlayerVideo; startedAt: string | null; preview?: boolean }) {
  const [ready, setReady] = useState(preview);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (preview) return;
    setReady(false);
    setLeaving(false);
    const preloader = document.createElement("video");
    preloader.preload = "auto";
    preloader.muted = true;
    preloader.playsInline = true;
    const onReady = () => setReady(true);
    // `canplaythrough` is ideal, while `canplay` covers servers that do not
    // provide enough duration metadata for the browser to estimate it.
    preloader.addEventListener("canplaythrough", onReady, { once: true });
    preloader.addEventListener("canplay", onReady, { once: true });
    preloader.src = video.videoUrl;
    preloader.load();
    return () => {
      preloader.removeEventListener("canplaythrough", onReady);
      preloader.removeEventListener("canplay", onReady);
      preloader.removeAttribute("src");
      preloader.load();
    };
  }, [preview, video.id, video.videoUrl]);

  useEffect(() => {
    if (preview || !startedAt || !ready || leaving) return;
    const elapsed = Math.max(0, Date.now() - new Date(startedAt).getTime());
    // The card enters in 700ms, holds, then takes 800ms to leave. Hold it
    // beyond this point whenever the video buffer is still catching up.
    const waitBeforeExit = Math.max(0, MIN_TRANSITION_MS - EXIT_MS - elapsed);
    const timer = window.setTimeout(() => setLeaving(true), waitBeforeExit);
    return () => window.clearTimeout(timer);
  }, [preview, startedAt, ready, leaving]);

  useEffect(() => {
    if (preview || !leaving) return;
    const timer = window.setTimeout(() => { void fetch("/api/broadcast/video/advance", { method: "POST" }); }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [preview, leaving]);

  return (
    <main className={["relative flex min-h-screen items-center justify-center overflow-hidden bg-maroon-900 px-12 text-center text-cream-50", leaving ? "mm-video-transition-out" : "mm-video-transition-in"].join(" ")}>
      <Image src="/broadcast/oak-motif.png" alt="" width={1254} height={1254} priority aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 w-[min(92vw,1000px)] -translate-x-1/2 -translate-y-1/2 opacity-[0.22]" />
      <div className="relative z-10 max-w-5xl border-y border-white/45 py-12">
        <p className="font-condensed text-2xl font-bold uppercase tracking-[0.35em] text-white">Now over to</p>
        <h1 className="mt-5 font-serif text-7xl font-bold">{video.playerName}</h1>
        <p className="mt-6 font-condensed text-3xl font-semibold uppercase tracking-[0.18em]">Hole {video.hole} · Shot {video.shotNumber}</p>
      </div>
    </main>
  );
}
