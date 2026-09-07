"use client";

import Image from "next/image";
import type { BroadcastPlayerVideo } from "@/lib/broadcast/types";

function toPar(value: number | null) {
  if (value == null || value === 0) return "E";
  return value > 0 ? `+${value}` : String(value);
}

export function PlayerVideoScene({ video, preview = false }: { video: BroadcastPlayerVideo; preview?: boolean }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black">
      {preview ? (
        <><Image src="/loading/desktop.png" alt="Player video preview" fill priority className="object-cover" /><div className="absolute inset-0 grid place-items-center bg-black/35 font-condensed text-4xl font-bold uppercase tracking-[0.2em] text-white">Player video preview</div></>
      ) : (
        <video className="h-screen w-screen object-contain" src={video.videoUrl} autoPlay playsInline onEnded={() => { void fetch("/api/broadcast/video/complete", { method: "POST" }); }} />
      )}
      <div className="absolute right-8 top-8 w-[510px] overflow-hidden border border-white/25 bg-white font-condensed font-bold uppercase shadow-2xl">
        <div className="flex h-18 items-stretch bg-[#135a50] text-white">
          <span className="grid w-20 place-items-center bg-[#30a76a] text-2xl">{video.hole}</span>
          <span className="flex flex-1 items-center px-5 text-3xl tracking-wide">{video.playerName}</span>
          <span className="grid w-24 place-items-center bg-[#b20e3a] text-3xl">{toPar(video.scoreToPar)}</span>
        </div>
        <div className="flex h-12 items-center bg-stone-200 px-5 text-2xl tracking-wide text-ink-900"><span>Par {video.par}</span><span className="ml-10">{video.yards} yds</span><span className="ml-auto">Shot {video.shotNumber}</span></div>
      </div>
    </main>
  );
}
