"use client";

import { useEffect } from "react";
import type { BroadcastPlayerVideo } from "@/lib/broadcast/types";

export function PlayerVideoTransitionScene({ video, startedAt, preview = false }: { video: BroadcastPlayerVideo; startedAt: string | null; preview?: boolean }) {
  useEffect(() => {
    if (preview || !startedAt) return;
    const remaining = Math.max(0, 4000 - (Date.now() - new Date(startedAt).getTime()));
    const timer = setTimeout(() => { void fetch("/api/broadcast/video/advance", { method: "POST" }); }, remaining);
    return () => clearTimeout(timer);
  }, [preview, startedAt, video.id]);

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-maroon-950 px-12 text-center text-cream-50">
      <div className="max-w-5xl border-y border-gold-400/60 py-12">
        <p className="font-condensed text-2xl font-bold uppercase tracking-[0.35em] text-gold-300">Now over to</p>
        <h1 className="mt-5 font-serif text-7xl font-bold">{video.playerName}</h1>
        <p className="mt-6 font-condensed text-3xl font-semibold uppercase tracking-[0.18em]">Hole {video.hole} · Shot {video.shotNumber}</p>
      </div>
    </main>
  );
}
