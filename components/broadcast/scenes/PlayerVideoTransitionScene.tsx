"use client";

import { useEffect } from "react";
import Image from "next/image";
import type { BroadcastPlayerVideo } from "@/lib/broadcast/types";

export function PlayerVideoTransitionScene({ video, startedAt, preview = false }: { video: BroadcastPlayerVideo; startedAt: string | null; preview?: boolean }) {
  useEffect(() => {
    if (preview || !startedAt) return;
    const remaining = Math.max(0, 4000 - (Date.now() - new Date(startedAt).getTime()));
    const timer = setTimeout(() => { void fetch("/api/broadcast/video/advance", { method: "POST" }); }, remaining);
    return () => clearTimeout(timer);
  }, [preview, startedAt, video.id]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-maroon-900 px-12 text-center text-cream-50">
      <Image src="/broadcast/oak-motif.png" alt="" width={1254} height={1254} priority aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 w-[min(92vw,1000px)] -translate-x-1/2 -translate-y-1/2 opacity-[0.22]" />
      <div className="relative z-10 max-w-5xl border-y border-white/45 py-12">
        <p className="font-condensed text-2xl font-bold uppercase tracking-[0.35em] text-white">Now over to</p>
        <h1 className="mt-5 font-serif text-7xl font-bold">{video.playerName}</h1>
        <p className="mt-6 font-condensed text-3xl font-semibold uppercase tracking-[0.18em]">Hole {video.hole} · Shot {video.shotNumber}</p>
      </div>
    </main>
  );
}
